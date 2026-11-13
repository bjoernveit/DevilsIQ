import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { Player, Question, QuizAttempt, QuizConfig, Team } from './types/basketball';
import { ALL_TAGS } from './data/initialData';
import {
  filterQuestionsForTeam,
  generateQuizSession,
  getTeamQuizConfig
} from './utils/quizEngine';
import {
  auth,
  db,
  DEFAULT_QUIZ_CONFIG,
  OperationType,
  AccountDeletedError,
  handleFirestoreError,
  ensureUserProfileExists,
  signOutUser,
  updateUserProfileInFirestore,
  setUserRoleInFirestore,
  deletePlayerFromFirestore,
  saveQuestionToFirestore,
  toggleQuestionPriorityInFirestore,
  deleteQuestionFromFirestore,
  saveAttemptToFirestore,
  saveQuizConfigToFirestore,
  removeTopicLabelFromFirestore,
  createTeamInFirestore,
  updateTeamInFirestore,
  deleteTeamFromFirestore,
  toIsoString
} from './lib/firebase';
import { AuthScreen } from './components/AuthScreen';
import { ProfileModal } from './components/ProfileModal';
import { PlayerHomeView } from './components/PlayerHomeView';
import { QuizSession } from './components/QuizSession';
import { CoachAnalyticsView } from './components/CoachAnalyticsView';
import { CoachTeamsView } from './components/CoachTeamsView';
import { QuestionBankView } from './components/QuestionBankView';
import { QuestionEditorModal } from './components/QuestionEditorModal';
import { PlayerDetailModal } from './components/PlayerDetailModal';
import { QuizResultsModal } from './components/QuizResultsModal';
import { QuizConfigModal } from './components/QuizConfigModal';
import { Play, ClipboardList, SlidersHorizontal } from 'lucide-react';

type TabType = 'quiz' | 'coach';
type CoachSubTab = 'analytics' | 'teams' | 'questions';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [quizConfig, setQuizConfig] = useState<QuizConfig>(DEFAULT_QUIZ_CONFIG);

  const [activeTab, setActiveTab] = useState<TabType>('quiz');
  const [coachSubTab, setCoachSubTab] = useState<CoachSubTab>('analytics');
  const [playerSelectedTeamId, setPlayerSelectedTeamId] = useState<string | null>(null);
  const [coachSelectedTeamId, setCoachSelectedTeamId] = useState<string | null>(null);
  const [coachAnalyticsTeamFilter, setCoachAnalyticsTeamFilter] = useState<string>('all');
  const [coachQuestionsTeamFilter, setCoachQuestionsTeamFilter] = useState<string>('all');

  const [isQuizActive, setIsQuizActive] = useState<boolean>(false);
  const [activeQuizQuestions, setActiveQuizQuestions] = useState<Question[]>([]);
  const [activeQuizTeamId, setActiveQuizTeamId] = useState<string | undefined>(undefined);
  const [activeQuizTimeSeconds, setActiveQuizTimeSeconds] = useState<number>(
    DEFAULT_QUIZ_CONFIG.timePerQuestionSeconds
  );

  // Modals
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isPlayerDetailOpen, setIsPlayerDetailOpen] = useState(false);
  const [selectedPlayerForDetail, setSelectedPlayerForDetail] = useState<Player | null>(null);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [latestAttempt, setLatestAttempt] = useState<QuizAttempt | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configTargetTeam, setConfigTargetTeam] = useState<Team | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      setFirebaseUser(user);
      setAuthReady(true);

      if (user) {
        setProfileReady(false);
        try {
          await ensureUserProfileExists(user);
          setAuthNotice(null);
          setProfileReady(true);
        } catch (err) {
          if (err instanceof AccountDeletedError) {
            setAuthNotice(err.message);
          } else {
            console.error('Failed to ensure profile:', err);
            setProfileReady(true);
          }
        }
      } else {
        setProfileReady(false);
        setPlayers([]);
        setQuestions([]);
        setAttempts([]);
        setTeams([]);
        setQuizConfig(DEFAULT_QUIZ_CONFIG);
        setIsQuizActive(false);
        setActiveTab('quiz');
        setPlayerSelectedTeamId(null);
        setCoachSelectedTeamId(null);
        setCoachAnalyticsTeamFilter('all');
        setCoachQuestionsTeamFilter('all');
      }
    });

    return () => unsubscribe();
  }, []);

  // Attach Firestore real-time listeners only when authenticated & profile exists
  useEffect(() => {
    if (!firebaseUser || !profileReady) return;

    const usersQuery = query(collection(db, 'users'), where('role', 'in', ['player', 'coach']));
    const unsubUsers = onSnapshot(
      usersQuery,
      snapshot => {
        const list: Player[] = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: String(data.displayName || data.username || 'Spieler'),
            username: data.username ? String(data.username) : undefined,
            avatarColor: '#171717',
            role: data.role === 'coach' ? 'coach' : 'player'
          };
        });
        setPlayers(list);
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    );

    const questionsQuery = query(
      collection(db, 'questions'),
      where('isPriorityFocus', 'in', [true, false])
    );
    const unsubQuestions = onSnapshot(
      questionsQuery,
      snapshot => {
        const list: Question[] = snapshot.docs
          .map(docSnap => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              title: String(data.title || ''),
              scenario: String(data.scenario || ''),
              keyConcept: String(data.keyConcept || ''),
              isPriorityFocus: Boolean(data.isPriorityFocus),
              tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
              teamIds: Array.isArray(data.teamIds) ? data.teamIds.map(String) : undefined,
              explanation: String(data.explanation || ''),
              options: Array.isArray(data.options) ? data.options : [],
              diagram: data.diagram || undefined,
              imageUrl: data.imageUrl ? String(data.imageUrl) : undefined,
              createdAt: toIsoString(data.createdAt)
            } as Question;
          })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setQuestions(list);
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, 'questions');
      }
    );

    const attemptsQuery = query(collection(db, 'attempts'), where('totalQuestions', '>', 0));
    const unsubAttempts = onSnapshot(
      attemptsQuery,
      snapshot => {
        const list: QuizAttempt[] = snapshot.docs
          .map(docSnap => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              playerId: String(data.playerId || ''),
              teamId: data.teamId ? String(data.teamId) : undefined,
              timestamp: String(data.timestamp || toIsoString(data.createdAt)),
              weekKey: String(data.weekKey || ''),
              totalScore: Number(data.totalScore || 0),
              correctCount: Number(data.correctCount || 0),
              totalQuestions: Number(data.totalQuestions || 1),
              totalTimeSeconds: Number(data.totalTimeSeconds || 0),
              maxStreak: Number(data.maxStreak || 0),
              answers: Array.isArray(data.answers) ? data.answers : []
            } as QuizAttempt;
          })
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setAttempts(list);
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, 'attempts');
      }
    );

    const teamsQuery = query(collection(db, 'teams'), where('questionCount', '>=', 1));
    const unsubTeams = onSnapshot(
      teamsQuery,
      snapshot => {
        const list: Team[] = snapshot.docs
          .map(docSnap => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              name: String(data.name || ''),
              playerIds: Array.isArray(data.playerIds) ? data.playerIds.map(String) : [],
              questionCount: Number(data.questionCount || DEFAULT_QUIZ_CONFIG.questionCount),
              timePerQuestionSeconds: Number(
                data.timePerQuestionSeconds || DEFAULT_QUIZ_CONFIG.timePerQuestionSeconds
              ),
              prioritizeFocusQuestions:
                data.prioritizeFocusQuestions !== undefined
                  ? Boolean(data.prioritizeFocusQuestions)
                  : DEFAULT_QUIZ_CONFIG.prioritizeFocusQuestions,
              ensureDiverseTopics:
                data.ensureDiverseTopics !== undefined
                  ? Boolean(data.ensureDiverseTopics)
                  : DEFAULT_QUIZ_CONFIG.ensureDiverseTopics,
              selectedTags: Array.isArray(data.selectedTags)
                ? data.selectedTags.map(String)
                : undefined,
              createdBy: String(data.createdBy || ''),
              createdAt: toIsoString(data.createdAt),
              updatedAt: toIsoString(data.updatedAt)
            } as Team;
          })
          .sort((a, b) => a.name.localeCompare(b.name, 'de'));
        setTeams(list);
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, 'teams');
      }
    );

    const unsubConfig = onSnapshot(
      doc(db, 'team_meta', 'quiz_config'),
      docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setQuizConfig({
            questionCount: Number(data.questionCount || DEFAULT_QUIZ_CONFIG.questionCount),
            timePerQuestionSeconds: Number(
              data.timePerQuestionSeconds || DEFAULT_QUIZ_CONFIG.timePerQuestionSeconds
            ),
            prioritizeFocusQuestions:
              data.prioritizeFocusQuestions !== undefined
                ? Boolean(data.prioritizeFocusQuestions)
                : DEFAULT_QUIZ_CONFIG.prioritizeFocusQuestions,
            ensureDiverseTopics:
              data.ensureDiverseTopics !== undefined
                ? Boolean(data.ensureDiverseTopics)
                : DEFAULT_QUIZ_CONFIG.ensureDiverseTopics,
            selectedTags: Array.isArray(data.selectedTags) ? data.selectedTags.map(String) : undefined,
            topicLabels: Array.isArray(data.topicLabels) ? data.topicLabels.map(String) : undefined
          });
        }
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'team_meta/quiz_config');
      }
    );

    const unsubDeleted = onSnapshot(
      doc(db, 'deleted_users', firebaseUser.uid),
      docSnap => {
        if (docSnap.exists()) {
          setAuthNotice('Dieses Konto wurde vom Trainer gelöscht.');
          void signOutUser();
        }
      },
      error => {
        handleFirestoreError(error, OperationType.GET, `deleted_users/${firebaseUser.uid}`);
      }
    );

    return () => {
      unsubUsers();
      unsubQuestions();
      unsubAttempts();
      unsubTeams();
      unsubConfig();
      unsubDeleted();
    };
  }, [firebaseUser, profileReady]);

  if (!authReady || (firebaseUser && !profileReady)) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center text-xs text-zinc-400">
        Laden...
      </div>
    );
  }

  if (!firebaseUser) {
    return <AuthScreen notice={authNotice} onClearNotice={() => setAuthNotice(null)} />;
  }

  const fallbackPlayer: Player = {
    id: firebaseUser.uid,
    name: firebaseUser.email?.split('@')[0] || 'Spieler',
    username: firebaseUser.email?.split('@')[0] || 'spieler',
    avatarColor: '#171717',
    role: 'player'
  };

  const currentPlayer = players.find(p => p.id === firebaseUser.uid) || fallbackPlayer;
  const isCoach = currentPlayer.role === 'coach';

  const selectableTeams = isCoach
    ? teams
    : teams.filter(t => t.playerIds.includes(currentPlayer.id));

  const activePlayerTeam = isCoach
    ? (playerSelectedTeamId ? teams.find(t => t.id === playerSelectedTeamId) || null : null)
    : (selectableTeams.find(t => t.id === playerSelectedTeamId) || selectableTeams[0] || null);

  const effectivePlayerConfig = getTeamQuizConfig(activePlayerTeam, quizConfig);
  const effectivePlayerQuestions = activePlayerTeam
    ? filterQuestionsForTeam(questions, activePlayerTeam.id)
    : teams.length > 0
    ? filterQuestionsForTeam(questions, null)
    : questions;

  const handleStartQuiz = () => {
    const sessionQuestions = generateQuizSession(
      effectivePlayerQuestions,
      effectivePlayerConfig
    );
    if (sessionQuestions.length === 0) return;
    setActiveQuizQuestions(sessionQuestions);
    setActiveQuizTeamId(activePlayerTeam?.id);
    setActiveQuizTimeSeconds(effectivePlayerConfig.timePerQuestionSeconds);
    setIsQuizActive(true);
  };

  const handleFinishQuiz = async (attempt: QuizAttempt) => {
    const normalizedAttempt: QuizAttempt = {
      ...attempt,
      playerId: firebaseUser.uid,
      ...(activeQuizTeamId ? { teamId: activeQuizTeamId } : {})
    };
    setLatestAttempt(normalizedAttempt);
    setIsQuizActive(false);
    setIsResultsOpen(true);
    await saveAttemptToFirestore(normalizedAttempt);
  };

  const managedLabels =
    quizConfig.topicLabels !== undefined
      ? quizConfig.topicLabels
      : Array.from(new Set([...ALL_TAGS, ...questions.flatMap(q => q.tags)]));

  const allKnownTags = Array.from(new Set([...managedLabels, ...questions.flatMap(q => q.tags)]));

  const handleSaveQuestion = async (updated: Question) => {
    const exists = questions.some(q => q.id === updated.id);
    await saveQuestionToFirestore(updated, exists, firebaseUser.uid);

    const newLabels = updated.tags.filter(t => !managedLabels.includes(t));
    if (newLabels.length > 0 && isCoach) {
      await saveQuizConfigToFirestore({
        ...quizConfig,
        topicLabels: Array.from(new Set([...managedLabels, ...newLabels]))
      });
    }
  };

  const handleRemoveTopicLabel = async (tag: string) => {
    if (!isCoach) return;
    await removeTopicLabelFromFirestore(tag, allKnownTags, questions, quizConfig, teams);
  };

  const handleDeleteQuestion = async (questionId: string) => {
    await deleteQuestionFromFirestore(questionId);
  };

  const handleDuplicateQuestion = (q: Question) => {
    const duplicated: Question = {
      ...q,
      id: '',
      title: `${q.title} (Kopie)`,
      createdAt: new Date().toISOString()
    };
    setEditingQuestion(duplicated);
    setIsEditorOpen(true);
  };

  const handleTogglePriorityFocus = async (questionId: string) => {
    const target = questions.find(q => q.id === questionId);
    if (!target) return;
    await toggleQuestionPriorityInFirestore(questionId, !target.isPriorityFocus);
  };

  const openConfigModalForTeam = (team: Team | null) => {
    setConfigTargetTeam(team);
    setIsConfigOpen(true);
  };

  const handleSaveConfig = async (nextConfig: QuizConfig) => {
    if (!isCoach) return;
    if (configTargetTeam) {
      await updateTeamInFirestore(configTargetTeam.id, {
        questionCount: nextConfig.questionCount,
        timePerQuestionSeconds: nextConfig.timePerQuestionSeconds,
        prioritizeFocusQuestions: nextConfig.prioritizeFocusQuestions,
        ensureDiverseTopics: nextConfig.ensureDiverseTopics,
        selectedTags: nextConfig.selectedTags || null
      });
      return;
    }

    const mergedConfig: QuizConfig = {
      ...nextConfig,
      topicLabels: managedLabels
    };
    setQuizConfig(mergedConfig);
    await saveQuizConfigToFirestore(mergedConfig);
  };

  const handleSelectPlayerDetail = (player: Player) => {
    setSelectedPlayerForDetail(player);
    setIsPlayerDetailOpen(true);
  };

  const handleToggleMemberRole = async (target: Player, nextRole: 'player' | 'coach') => {
    await setUserRoleInFirestore(target, nextRole);
    setSelectedPlayerForDetail(prev => (prev && prev.id === target.id ? { ...prev, role: nextRole } : prev));
  };

  const handleDeletePlayer = async (target: Player) => {
    if (!isCoach || target.id === firebaseUser.uid) return;
    await deletePlayerFromFirestore(target, attempts, firebaseUser.uid, teams);
    setIsPlayerDetailOpen(false);
    setSelectedPlayerForDetail(null);
  };

  const effectiveTab: TabType = activeTab === 'coach' && !isCoach ? 'quiz' : activeTab;

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col font-sans">
      {/* Minimal 3-Zone Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-4 sm:px-6 h-14 bg-black/85 backdrop-blur-md border-b border-zinc-800/90">
        <button
          onClick={() => {
            setIsQuizActive(false);
            setActiveTab('quiz');
          }}
          className="flex items-center gap-2.5 text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          <img
            src={`${import.meta.env.BASE_URL}assets/aistudio/logodevils_7cf5d62a.jpg`}
            alt="Devils Logo"
            referrerPolicy="no-referrer"
            className="w-7 h-7 rounded-md object-contain bg-black"
          />
          <span>
            Devils<span className="text-red-500">IQ</span>
          </span>
        </button>

        {isCoach && (
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
            <button
              onClick={() => {
                setIsQuizActive(false);
                setActiveTab('quiz');
              }}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                effectiveTab === 'quiz' ? 'text-white font-semibold' : 'hover:text-zinc-200'
              }`}
            >
              Quiz
            </button>
            <button
              onClick={() => {
                setIsQuizActive(false);
                setActiveTab('coach');
              }}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                effectiveTab === 'coach' ? 'text-white font-semibold' : 'hover:text-zinc-200'
              }`}
            >
              Trainer
            </button>
          </nav>
        )}

        <button
          onClick={() => setIsProfileOpen(true)}
          className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0 min-h-[36px] transition-colors"
          aria-label="Kontoeinstellungen öffnen"
        >
          {currentPlayer.name}
        </button>
      </header>

      {/* Main Content */}
      <main className={`flex-1 ${isCoach ? 'pb-20 md:pb-10' : 'pb-10'}`}>
        {isQuizActive ? (
          <QuizSession
            questions={activeQuizQuestions}
            player={currentPlayer}
            timePerQuestion={activeQuizTimeSeconds}
            onFinishQuiz={handleFinishQuiz}
            onExit={() => setIsQuizActive(false)}
          />
        ) : effectiveTab === 'quiz' ? (
          <PlayerHomeView
            player={currentPlayer}
            players={players}
            attempts={attempts}
            teams={teams}
            selectableTeams={selectableTeams}
            activeTeam={activePlayerTeam}
            onSelectTeamId={setPlayerSelectedTeamId}
            quizConfig={effectivePlayerConfig}
            questionCount={effectivePlayerQuestions.length}
            isCoach={isCoach}
            onStartQuiz={handleStartQuiz}
            onOpenConfig={() => openConfigModalForTeam(activePlayerTeam)}
            onSelectPlayerDetail={handleSelectPlayerDetail}
            onGoToCoachQuestions={() => {
              setActiveTab('coach');
              setCoachSubTab('questions');
            }}
          />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
            {/* Coach Header & Sub-Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-white">Trainer</h1>
                <p className="text-xs text-zinc-400">
                  Statistik, gemeinsame Teams und Fragenkatalog
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <button
                    onClick={() => setCoachSubTab('analytics')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px] whitespace-nowrap ${
                      coachSubTab === 'analytics'
                        ? 'bg-red-700 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Statistik
                  </button>
                  <button
                    onClick={() => setCoachSubTab('teams')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px] whitespace-nowrap ${
                      coachSubTab === 'teams'
                        ? 'bg-red-700 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Teams ({teams.length})
                  </button>
                  <button
                    onClick={() => setCoachSubTab('questions')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px] whitespace-nowrap ${
                      coachSubTab === 'questions'
                        ? 'bg-red-700 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Fragen ({questions.length})
                  </button>
                </div>

                <button
                  onClick={() => {
                    if (coachSubTab === 'teams') {
                      const activeCoachTeam =
                        teams.find(t => t.id === coachSelectedTeamId) || teams[0] || null;
                      openConfigModalForTeam(activeCoachTeam);
                    } else if (
                      coachSubTab === 'analytics' &&
                      coachAnalyticsTeamFilter !== 'all'
                    ) {
                      const filteredTeam =
                        teams.find(t => t.id === coachAnalyticsTeamFilter) || null;
                      openConfigModalForTeam(filteredTeam);
                    } else {
                      openConfigModalForTeam(null);
                    }
                  }}
                  className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white min-h-[40px] min-w-[40px] flex items-center justify-center transition-colors"
                  aria-label="Quiz-Einstellungen"
                  title="Quiz-Einstellungen"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>

            {coachSubTab === 'analytics' ? (
              <CoachAnalyticsView
                players={players}
                questions={questions}
                attempts={attempts}
                teams={teams}
                selectedTeamId={coachAnalyticsTeamFilter}
                onSelectTeamId={setCoachAnalyticsTeamFilter}
                onOpenTeamConfig={team => openConfigModalForTeam(team)}
                onTogglePriorityFocus={handleTogglePriorityFocus}
                onSelectPlayerDetail={handleSelectPlayerDetail}
              />
            ) : coachSubTab === 'teams' ? (
              <CoachTeamsView
                teams={teams}
                players={players}
                questions={questions}
                selectedTeamId={coachSelectedTeamId}
                onSelectTeamId={setCoachSelectedTeamId}
                onCreateTeam={name => createTeamInFirestore(name, firebaseUser.uid, quizConfig)}
                onUpdateTeam={(teamId, updates) => updateTeamInFirestore(teamId, updates)}
                onDeleteTeam={teamId => deleteTeamFromFirestore(teamId, questions)}
                onOpenTeamConfig={team => openConfigModalForTeam(team)}
                onGoToTeamQuestions={teamId => {
                  setCoachQuestionsTeamFilter(teamId);
                  setCoachSubTab('questions');
                }}
              />
            ) : (
              <QuestionBankView
                questions={questions}
                teams={teams}
                selectedTeamFilter={coachQuestionsTeamFilter}
                onChangeTeamFilter={setCoachQuestionsTeamFilter}
                topicLabels={allKnownTags}
                onAddQuestion={() => {
                  setEditingQuestion(null);
                  setIsEditorOpen(true);
                }}
                onEditQuestion={q => {
                  setEditingQuestion(q);
                  setIsEditorOpen(true);
                }}
                onDuplicateQuestion={handleDuplicateQuestion}
                onDeleteQuestion={handleDeleteQuestion}
                onTogglePriorityFocus={handleTogglePriorityFocus}
                onRemoveTopicLabel={handleRemoveTopicLabel}
              />
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Nav (only shown when Coach tab is available) */}
      {isCoach && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/90 backdrop-blur-md border-t border-zinc-800 grid grid-cols-2 items-center h-15"
        >
          <button
            onClick={() => {
              setIsQuizActive(false);
              setActiveTab('quiz');
            }}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] ${
              effectiveTab === 'quiz' ? 'text-red-500 font-semibold' : 'text-zinc-400'
            }`}
          >
            <Play className="w-5 h-5" />
            <span className="text-[11px] mt-0.5">Quiz</span>
          </button>

          <button
            onClick={() => {
              setIsQuizActive(false);
              setActiveTab('coach');
            }}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] ${
              effectiveTab === 'coach' ? 'text-red-500 font-semibold' : 'text-zinc-400'
            }`}
          >
            <ClipboardList className="w-5 h-5" />
            <span className="text-[11px] mt-0.5">Trainer</span>
          </button>
        </nav>
      )}

      {/* Modals */}
      {isCoach && (
        <QuestionEditorModal
          question={editingQuestion}
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingQuestion(null);
          }}
          onSave={handleSaveQuestion}
          existingTags={allKnownTags}
          teams={teams}
          defaultTeamIds={
            coachSubTab === 'questions' &&
            coachQuestionsTeamFilter !== 'all' &&
            coachQuestionsTeamFilter !== 'global'
              ? [coachQuestionsTeamFilter]
              : []
          }
          onRemoveTopicLabel={handleRemoveTopicLabel}
        />
      )}

      <PlayerDetailModal
        player={selectedPlayerForDetail}
        attempts={attempts}
        questions={questions}
        isOpen={isPlayerDetailOpen}
        onClose={() => {
          setIsPlayerDetailOpen(false);
          setSelectedPlayerForDetail(null);
        }}
        viewerIsCoach={isCoach}
        currentUserId={currentPlayer.id}
        onToggleRole={handleToggleMemberRole}
        onDeletePlayer={handleDeletePlayer}
      />

      <QuizResultsModal
        attempt={latestAttempt}
        questions={questions}
        player={currentPlayer}
        isOpen={isResultsOpen}
        onClose={() => setIsResultsOpen(false)}
        onRetake={() => {
          setIsResultsOpen(false);
          handleStartQuiz();
        }}
        onGoToLeaderboard={() => {
          setIsResultsOpen(false);
          setActiveTab('quiz');
        }}
      />

      {isCoach && (
        <QuizConfigModal
          config={configTargetTeam ? getTeamQuizConfig(configTargetTeam, quizConfig) : quizConfig}
          targetTeamName={configTargetTeam?.name || null}
          isOpen={isConfigOpen}
          onClose={() => {
            setIsConfigOpen(false);
            setConfigTargetTeam(null);
          }}
          onSave={handleSaveConfig}
          availableTags={allKnownTags}
        />
      )}

      <ProfileModal
        player={currentPlayer}
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onSaveProfile={updates => updateUserProfileInFirestore(firebaseUser.uid, updates)}
        onSignOut={async () => {
          setIsProfileOpen(false);
          await signOutUser();
        }}
      />
    </div>
  );
}
