import React, { useState, useEffect, useMemo, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Timestamp, collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { Player, Question, QuizAttempt, QuizConfig, Team, UserStats, UserDetails } from './types/basketball';
import { ALL_TAGS } from './data/initialData';
import {
  filterQuestionsForTeam,
  generateQuizSession,
  getTeamQuizConfig,
  calculatePlayerMedals,
  getWeekKey,
  getPreviousWeekKey,
  isPlayerOnline
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
  setDefaultTeamInFirestore,
  deleteTeamFromFirestore,
  markRoundStartedInFirestore,
  trackedGetDoc,
  trackedGetDocs,
  subscribeToReadCount,
  finalizeCompletedWeekMedalsIfNeeded,
  fetchAllUserDetailsDeltaOrCold,
  fetchUserStatsDeltaOrCold,
  fetchQuestionsDeltaOrCold,
  backfillMissingQuestionUpdatedAt,
  QUESTIONS_CACHE_KEY,
  USER_STATS_CACHE_KEY,
  USER_DETAILS_CACHE_KEY,
  toIsoString
} from './lib/firebase';
import {
  mergeQuestionsWithDelta,
  writeQuestionsCache,
  upsertQuestionsInCache,
  removeQuestionFromCache
} from './utils/questionCache';
import {
  readAggregatesCache,
  writeAggregatesCache,
  mergeAggregateEntriesWithDelta,
  upsertAggregateEntriesInCache,
  removeAggregateEntryFromCache
} from './utils/aggregatesCache';
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
import { PlayerLabel } from './components/PlayerLabel';
import { UpdateBanner } from './components/UpdateBanner';
import {
  checkForNewAppVersion,
  getCurrentAppVersion,
  reloadToAppVersion,
  stripVersionQueryParamFromUrl
} from './utils/appVersion';
import { setAnalyticsUserContext, trackEvent } from './lib/analytics';
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
  const [coachQuestionsPlayerFilter, setCoachQuestionsPlayerFilter] = useState<string>('all');

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
  const [userStatsMap, setUserStatsMap] = useState<Map<string, UserStats>>(new Map());
  const [userDetailsMap, setUserDetailsMap] = useState<Map<string, UserDetails>>(new Map());
  const [allUserDetailsLoaded, setAllUserDetailsLoaded] = useState(false);
  const [isLoadingAllAttempts, setIsLoadingAllAttempts] = useState(false);
  const [allAttemptsLoaded, setAllAttemptsLoaded] = useState(false);

  const [documentReadCount, setDocumentReadCount] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [availableUpdateVersion, setAvailableUpdateVersion] = useState<string | null>(null);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);
  const shownUpdateBannerRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToReadCount(count => setDocumentReadCount(count));
    return () => unsub();
  }, []);

  useEffect(() => {
    trackEvent('app_open');
  }, []);

  // Check for newly deployed builds via cache-busted version.json on boot & foreground resume
  useEffect(() => {
    const cleanUrl = stripVersionQueryParamFromUrl(window.location.href);
    if (cleanUrl) {
      window.history.replaceState(null, '', cleanUrl);
    }

    const baseUrl = import.meta.env.BASE_URL || '/';
    const currentVersion = getCurrentAppVersion();
    let lastCheckedAt = 0;

    const runCheck = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastCheckedAt < 30_000) return;
      lastCheckedAt = now;
      const newerVersion = await checkForNewAppVersion(baseUrl, currentVersion);
      if (newerVersion) {
        setAvailableUpdateVersion(newerVersion);
      }
    };

    void runCheck(true);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void runCheck(false);
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void runCheck(false);
      }
    }, 5 * 60_000);

    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.clearInterval(intervalId);
    };
  }, []);

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
        setUserStatsMap(new Map());
        setUserDetailsMap(new Map());
        setAllUserDetailsLoaded(false);
        setAllAttemptsLoaded(false);
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

  // Load all app data efficiently via getDocs to prevent 50k+ read spikes from real-time snapshot broadcasting
  const loadAppData = async () => {
    if (!firebaseUser || !profileReady) return;
    try {
      const [usersSnap, questionsSync, teamsSnap, configSnap, userStatsSync] = await Promise.all([
        trackedGetDocs(query(collection(db, 'users'), where('role', 'in', ['player', 'coach']))),
        fetchQuestionsDeltaOrCold(),
        trackedGetDocs(query(collection(db, 'teams'), where('questionCount', '>=', 1))),
        trackedGetDoc(doc(db, 'team_meta', 'quiz_config')),
        fetchUserStatsDeltaOrCold()
      ]);

      const listPlayers: Player[] = usersSnap.docs.map((docSnap: any) => {
        const data = docSnap.data({ serverTimestamps: 'estimate' });
        const rawLastRound = data.lastRoundStartedAt;
        const lastRoundStartedAt =
          rawLastRound instanceof Timestamp
            ? rawLastRound.toDate().toISOString()
            : typeof rawLastRound === 'string' && rawLastRound.trim().length > 0
            ? rawLastRound
            : undefined;
        return {
          id: docSnap.id,
          name: String(data.displayName || data.username || 'Spieler'),
          username: data.username ? String(data.username) : undefined,
          avatarColor: '#171717',
          role: data.role === 'coach' ? 'coach' : 'player',
          isAdmin: Boolean(data.isAdmin),
          ...(lastRoundStartedAt ? { lastRoundStartedAt } : {})
        };
      });
      setPlayers(listPlayers);

      const validPlayerIds = new Set(listPlayers.map(p => p.id));
      const mergedStats = mergeAggregateEntriesWithDelta(
        userStatsSync.cachedEntries,
        userStatsSync.fetchedEntries,
        validPlayerIds
      );
      setUserStatsMap(new Map(mergedStats.map(s => [s.userId, s])));

      if (
        !userStatsSync.isDelta ||
        userStatsSync.fetchedEntries.length > 0 ||
        mergedStats.length !== userStatsSync.cachedEntries.length
      ) {
        writeAggregatesCache(USER_STATS_CACHE_KEY, {
          version: 1,
          lastSyncedCursor: userStatsSync.nextCursor,
          entries: mergedStats
        });
      }

      // Hydrate UserDetails from localStorage cache (0 Firestore reads) and prune deleted players
      const cachedDetailsData = readAggregatesCache<UserDetails>(USER_DETAILS_CACHE_KEY);
      if (cachedDetailsData && cachedDetailsData.entries.length > 0) {
        const prunedDetails = mergeAggregateEntriesWithDelta(
          cachedDetailsData.entries,
          [],
          validPlayerIds
        );
        setUserDetailsMap(new Map(prunedDetails.map(d => [d.userId, d])));
        if (prunedDetails.length !== cachedDetailsData.entries.length) {
          writeAggregatesCache(USER_DETAILS_CACHE_KEY, {
            version: 1,
            lastSyncedCursor: cachedDetailsData.lastSyncedCursor,
            entries: prunedDetails
          });
        }
      }

      let deletedQuestionIds: string[] = [];
      let loadedMedalsFinalizedThrough: string | undefined;
      const configDocExists = configSnap.exists();
      if (configDocExists) {
        const data = configSnap.data();
        deletedQuestionIds = Array.isArray(data.deletedQuestionIds)
          ? data.deletedQuestionIds.map(String)
          : [];
        loadedMedalsFinalizedThrough =
          typeof data.medalsFinalizedThroughWeek === 'string'
            ? data.medalsFinalizedThroughWeek
            : undefined;
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
          topicLabels: Array.isArray(data.topicLabels) ? data.topicLabels.map(String) : undefined,
          deletedQuestionIds: deletedQuestionIds.length > 0 ? deletedQuestionIds : undefined,
          medalsFinalizedThroughWeek: loadedMedalsFinalizedThrough
        });
      }

      const mergedQuestions = mergeQuestionsWithDelta(
        questionsSync.cachedQuestions,
        questionsSync.fetchedQuestions,
        deletedQuestionIds
      );
      setQuestions(mergedQuestions);

      if (
        !questionsSync.isDelta ||
        questionsSync.fetchedQuestions.length > 0 ||
        mergedQuestions.length !== questionsSync.cachedQuestions.length
      ) {
        writeQuestionsCache(QUESTIONS_CACHE_KEY, {
          version: 1,
          lastSyncedCursor: questionsSync.nextCursor,
          questions: mergedQuestions
        });
      }

      const loadedUserIsCoach = listPlayers.some(p => p.id === firebaseUser.uid && p.role === 'coach');
      if (loadedUserIsCoach && questionsSync.missingUpdatedAtIds.length > 0) {
        void backfillMissingQuestionUpdatedAt(questionsSync.missingUpdatedAtIds).catch(() => {});
      }

      const loadCurrentWeek = getWeekKey();
      const loadPreviousWeek = getPreviousWeekKey();
      if (
        loadedUserIsCoach &&
        (!loadedMedalsFinalizedThrough || loadedMedalsFinalizedThrough < loadPreviousWeek)
      ) {
        const statsMapSnapshot = new Map(mergedStats.map(s => [s.userId, s]));
        void finalizeCompletedWeekMedalsIfNeeded({
          players: listPlayers,
          existingStatsMap: statsMapSnapshot,
          medalsFinalizedThroughWeek: loadedMedalsFinalizedThrough,
          configExists: configDocExists,
          currentWeekKey: loadCurrentWeek,
          previousWeekKey: loadPreviousWeek
        })
          .then(res => {
            if (!res) return;
            if (res.updatedStats.length > 0) {
              setUserStatsMap(prev => {
                const next = new Map(prev);
                for (const st of res.updatedStats) {
                  next.set(st.userId, st);
                }
                return next;
              });
              upsertAggregateEntriesInCache(USER_STATS_CACHE_KEY, res.updatedStats);
            }
            setQuizConfig(prev => ({
              ...prev,
              medalsFinalizedThroughWeek: res.medalsFinalizedThroughWeek
            }));
          })
          .catch(() => {});
      }

      // Attempts are not loaded on page load to conserve Firestore reads (aggregated user_stats are used instead)

      const listTeams: Team[] = teamsSnap.docs
        .map((docSnap: any) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: String(data.name || ''),
            playerIds: Array.isArray(data.playerIds) ? data.playerIds.map(String) : [],
            isDefault: Boolean(data.isDefault),
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
        .sort((a: any, b: any) => a.name.localeCompare(b.name, 'de'));
      setTeams(listTeams);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'app_data');
    }
  };

  const handleLoadAllAttempts = async () => {
    if (isLoadingAllAttempts || allAttemptsLoaded) return;
    setIsLoadingAllAttempts(true);
    try {
      const snap = await trackedGetDocs(collection(db, 'attempts'));
      const listAttempts: QuizAttempt[] = snap.docs
        .map((docSnap: any) => {
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
            answers: Array.isArray(data.answers) ? data.answers : [],
            passed: typeof data.passed === 'boolean' ? data.passed : undefined
          } as QuizAttempt;
        })
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setAttempts(listAttempts);
      setAllAttemptsLoaded(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'attempts');
    } finally {
      setIsLoadingAllAttempts(false);
    }
  };

  useEffect(() => {
    if (!firebaseUser || !profileReady) return;
    void loadAppData();

    setNowMs(Date.now());
    const onlineTicker = setInterval(() => {
      setNowMs(Date.now());
    }, 10_000);

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
      clearInterval(onlineTicker);
      unsubDeleted();
    };
  }, [firebaseUser, profileReady]);

  const currentPlayerRole = players.find(p => p.id === firebaseUser?.uid)?.role;
  useEffect(() => {
    if (!firebaseUser || !profileReady) return;
    if (currentPlayerRole !== 'coach' || activeTab !== 'coach' || allUserDetailsLoaded) return;
    let cancelled = false;
    const validIds = new Set(players.map(p => p.id));
    fetchAllUserDetailsDeltaOrCold()
      .then(syncResult => {
        if (cancelled) return;
        const merged = mergeAggregateEntriesWithDelta(
          syncResult.cachedEntries,
          syncResult.fetchedEntries,
          validIds.size > 0 ? validIds : null
        );
        setUserDetailsMap(prev => {
          const next = new Map(prev);
          merged.forEach(item => next.set(item.userId, item));
          return next;
        });
        if (
          !syncResult.isDelta ||
          syncResult.fetchedEntries.length > 0 ||
          merged.length !== syncResult.cachedEntries.length
        ) {
          writeAggregatesCache(USER_DETAILS_CACHE_KEY, {
            version: 1,
            lastSyncedCursor: syncResult.nextCursor,
            entries: merged
          });
        }
        setAllUserDetailsLoaded(true);
      })
      .catch(err => {
        console.warn('Could not load aggregated user details:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, profileReady, currentPlayerRole, activeTab, allUserDetailsLoaded, players]);

  const currentWeekKey = getWeekKey();
  const medalsByPlayer = useMemo(() => {
    const validIds = new Set(players.map(p => p.id));
    return calculatePlayerMedals(attempts, currentWeekKey, validIds, userStatsMap);
  }, [attempts, currentWeekKey, players, userStatsMap]);

  const showUpdateBanner =
    Boolean(availableUpdateVersion) && availableUpdateVersion !== dismissedUpdateVersion;

  useEffect(() => {
    if (!authReady) return;
    if (!firebaseUser) {
      setAnalyticsUserContext('guest');
      return;
    }
    if (!profileReady) return;
    setAnalyticsUserContext(currentPlayerRole === 'coach' ? 'coach' : 'player');
  }, [authReady, firebaseUser, profileReady, currentPlayerRole]);

  useEffect(() => {
    if (
      showUpdateBanner &&
      availableUpdateVersion &&
      !isQuizActive &&
      shownUpdateBannerRef.current !== availableUpdateVersion
    ) {
      shownUpdateBannerRef.current = availableUpdateVersion;
      trackEvent('update_banner_shown', { new_version: availableUpdateVersion });
    }
  }, [showUpdateBanner, availableUpdateVersion, isQuizActive]);

  if (!authReady || (firebaseUser && !profileReady)) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center text-xs text-zinc-400">
        Laden...
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-[#09090B] flex flex-col">
        {showUpdateBanner && availableUpdateVersion && (
          <UpdateBanner
            onUpdate={() => {
              trackEvent('update_banner_clicked', { new_version: availableUpdateVersion });
              reloadToAppVersion(availableUpdateVersion);
            }}
            onDismiss={() => {
              trackEvent('update_banner_dismissed', { new_version: availableUpdateVersion });
              setDismissedUpdateVersion(availableUpdateVersion);
            }}
          />
        )}
        <div className="flex-1">
          <AuthScreen notice={authNotice} onClearNotice={() => setAuthNotice(null)} />
        </div>
      </div>
    );
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

  const activePlayerTeam =
    selectableTeams.find(t => t.id === playerSelectedTeamId) ||
    selectableTeams.find(t => t.isDefault) ||
    selectableTeams[0] ||
    null;

  const effectivePlayerConfig = getTeamQuizConfig(activePlayerTeam, quizConfig);
  const effectivePlayerQuestions = activePlayerTeam
    ? filterQuestionsForTeam(questions, activePlayerTeam.id)
    : [];

  // Enforce strict team isolation for non-coach players:
  // Players can only ever see people in their own team(s), never players in other teams.
  const myTeamIds = new Set(selectableTeams.map(t => t.id));
  const visibleTeammateIds = new Set<string>([currentPlayer.id]);
  if (!isCoach) {
    for (const t of selectableTeams) {
      for (const pid of t.playerIds) {
        visibleTeammateIds.add(pid);
      }
    }
    for (const p of players) {
      if (
        p.role === 'coach' &&
        attempts.some(a => a.playerId === p.id && a.teamId && myTeamIds.has(a.teamId))
      ) {
        visibleTeammateIds.add(p.id);
      }
    }
  }

  const visibleTeams = isCoach ? teams : selectableTeams;
  const visiblePlayers = isCoach
    ? players
    : players.filter(p => visibleTeammateIds.has(p.id));
  const visibleAttempts = isCoach
    ? attempts
    : attempts.filter(
        a => visibleTeammateIds.has(a.playerId) && (!a.teamId || myTeamIds.has(a.teamId))
      );

  const handleStartQuiz = () => {
    if (!activePlayerTeam) return;
    const sessionQuestions = generateQuizSession(
      effectivePlayerQuestions,
      effectivePlayerConfig,
      activePlayerTeam.id
    );
    if (sessionQuestions.length === 0) return;
    setActiveQuizQuestions(sessionQuestions);
    setActiveQuizTeamId(activePlayerTeam.id);
    setActiveQuizTimeSeconds(effectivePlayerConfig.timePerQuestionSeconds);
    setIsQuizActive(true);
    setNowMs(Date.now());
    trackEvent('quiz_start', {
      team_id: activePlayerTeam.id,
      question_count: sessionQuestions.length,
      time_per_question: effectivePlayerConfig.timePerQuestionSeconds
    });
    void markRoundStartedInFirestore(firebaseUser.uid).catch(() => {});
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

    const passed = normalizedAttempt.passed ?? (normalizedAttempt.correctCount === normalizedAttempt.totalQuestions);
    const lastAnswer = normalizedAttempt.answers[normalizedAttempt.answers.length - 1];
    const failReason = passed
      ? 'none'
      : lastAnswer?.selectedOptionId === 'TIME_EXPIRED'
      ? 'timeout'
      : 'wrong_answer';
    trackEvent('quiz_complete', {
      team_id: activeQuizTeamId,
      passed,
      fail_reason: failReason,
      correct_count: normalizedAttempt.correctCount,
      total_questions: normalizedAttempt.totalQuestions,
      total_time_seconds: normalizedAttempt.totalTimeSeconds,
      max_streak: normalizedAttempt.maxStreak
    });

    const updatedAggregates = await saveAttemptToFirestore(
      normalizedAttempt,
      userStatsMap.get(firebaseUser.uid)
    );
    if (updatedAggregates) {
      setUserStatsMap(prev => {
        const next = new Map(prev);
        next.set(firebaseUser.uid, updatedAggregates.stats);
        return next;
      });
      setUserDetailsMap(prev => {
        const next = new Map(prev);
        next.set(firebaseUser.uid, updatedAggregates.details);
        return next;
      });
      upsertAggregateEntriesInCache(USER_STATS_CACHE_KEY, [updatedAggregates.stats]);
      upsertAggregateEntriesInCache(USER_DETAILS_CACHE_KEY, [updatedAggregates.details]);
    }
    if (allAttemptsLoaded) {
      setAttempts(prev => [normalizedAttempt, ...prev]);
    }
  };

  const managedLabels =
    quizConfig.topicLabels !== undefined
      ? quizConfig.topicLabels
      : Array.from(new Set([...ALL_TAGS, ...questions.flatMap(q => q.tags)]));

  const allKnownTags = Array.from(new Set([...managedLabels, ...questions.flatMap(q => q.tags)]));

  const handleSaveQuestion = async (updated: Question) => {
    const exists = questions.some(q => q.id === updated.id);
    await saveQuestionToFirestore(updated, exists, firebaseUser.uid);

    const nextQuestion: Question = {
      ...updated,
      updatedAt: updated.updatedAt || new Date().toISOString()
    };
    setQuestions(prev => mergeQuestionsWithDelta(prev, [nextQuestion]));
    upsertQuestionsInCache(QUESTIONS_CACHE_KEY, [nextQuestion]);

    const newLabels = updated.tags.filter(t => !managedLabels.includes(t));
    if (newLabels.length > 0 && isCoach) {
      const nextConfig: QuizConfig = {
        ...quizConfig,
        topicLabels: Array.from(new Set([...managedLabels, ...newLabels]))
      };
      setQuizConfig(nextConfig);
      await saveQuizConfigToFirestore(nextConfig);
    }
  };

  const handleRemoveTopicLabel = async (tag: string) => {
    if (!isCoach) return;
    await removeTopicLabelFromFirestore(tag, allKnownTags, questions, quizConfig, teams);

    const nowIso = new Date().toISOString();
    const affectedQuestions = questions
      .filter(q => q.tags.includes(tag))
      .map(q => ({
        ...q,
        tags: q.tags.filter(t => t !== tag),
        updatedAt: nowIso
      }));
    if (affectedQuestions.length > 0) {
      setQuestions(prev => mergeQuestionsWithDelta(prev, affectedQuestions));
      upsertQuestionsInCache(QUESTIONS_CACHE_KEY, affectedQuestions);
    }
    setQuizConfig(prev => ({
      ...prev,
      topicLabels: allKnownTags.filter(t => t !== tag),
      selectedTags: prev.selectedTags?.filter(t => t !== tag)
    }));
  };

  const handleDeleteQuestion = async (questionId: string) => {
    const nextDeletedIds = await deleteQuestionFromFirestore(questionId, quizConfig);
    setQuizConfig(prev => ({ ...prev, deletedQuestionIds: nextDeletedIds }));
    setQuestions(prev => prev.filter(q => q.id !== questionId));
    removeQuestionFromCache(QUESTIONS_CACHE_KEY, questionId);
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
    const nextFocus = !target.isPriorityFocus;
    await toggleQuestionPriorityInFirestore(questionId, nextFocus);

    const nextQuestion: Question = {
      ...target,
      isPriorityFocus: nextFocus,
      updatedAt: new Date().toISOString()
    };
    setQuestions(prev => mergeQuestionsWithDelta(prev, [nextQuestion]));
    upsertQuestionsInCache(QUESTIONS_CACHE_KEY, [nextQuestion]);
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
    if (!isCoach && player.id !== currentPlayer.id) {
      return;
    }
    trackEvent('player_detail_open', {
      is_own_profile: player.id === currentPlayer.id,
      viewer_role: currentPlayer.role || 'player'
    });
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
    setPlayers(prev => prev.filter(p => p.id !== target.id));
    setUserStatsMap(prev => {
      const next = new Map(prev);
      next.delete(target.id);
      return next;
    });
    setUserDetailsMap(prev => {
      const next = new Map(prev);
      next.delete(target.id);
      return next;
    });
    removeAggregateEntryFromCache<UserStats>(USER_STATS_CACHE_KEY, target.id);
    removeAggregateEntryFromCache<UserDetails>(USER_DETAILS_CACHE_KEY, target.id);
    setIsPlayerDetailOpen(false);
    setSelectedPlayerForDetail(null);
  };

  const effectiveTab: TabType = activeTab === 'coach' && !isCoach ? 'quiz' : activeTab;

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col font-sans">
      {/* Minimal 3-Zone Header */}
      <header
        className={`sticky top-0 z-30 ${
          isQuizActive ? 'hidden md:flex' : 'flex'
        } items-center justify-between gap-8 px-4 sm:px-6 h-14 bg-black/85 backdrop-blur-md border-b border-zinc-800/90`}
      >
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
          className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0 min-h-[36px] transition-colors flex items-center"
          aria-label="Kontoeinstellungen öffnen"
        >
          <PlayerLabel
            name={currentPlayer.name}
            medals={medalsByPlayer.get(currentPlayer.id)}
            isOnline={isPlayerOnline(currentPlayer.lastRoundStartedAt, nowMs)}
          />
        </button>
      </header>

      {showUpdateBanner && !isQuizActive && availableUpdateVersion && (
        <UpdateBanner
          onUpdate={() => {
            trackEvent('update_banner_clicked', { new_version: availableUpdateVersion });
            reloadToAppVersion(availableUpdateVersion);
          }}
          onDismiss={() => {
            trackEvent('update_banner_dismissed', { new_version: availableUpdateVersion });
            setDismissedUpdateVersion(availableUpdateVersion);
          }}
        />
      )}

      {/* Main Content */}
      <main
        className={`flex-1 ${
          isQuizActive
            ? 'pb-3 md:pb-8'
            : isCoach
            ? currentPlayer.isAdmin
              ? 'pb-32 md:pb-16'
              : 'pb-20 md:pb-10'
            : currentPlayer.isAdmin
            ? 'pb-16'
            : 'pb-10'
        }`}
      >
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
            players={visiblePlayers}
            attempts={visibleAttempts}
            teams={visibleTeams}
            selectableTeams={selectableTeams}
            activeTeam={activePlayerTeam}
            onSelectTeamId={setPlayerSelectedTeamId}
            quizConfig={effectivePlayerConfig}
            questionCount={effectivePlayerQuestions.length}
            isCoach={isCoach}
            medalsByPlayer={medalsByPlayer}
            userStatsMap={userStatsMap}
            nowMs={nowMs}
            onStartQuiz={handleStartQuiz}
            onOpenConfig={() => openConfigModalForTeam(activePlayerTeam)}
            onSelectPlayerDetail={handleSelectPlayerDetail}
            onGoToCoachQuestions={() => {
              setActiveTab('coach');
              setCoachSubTab('questions');
            }}
            onGoToCoachTeams={() => {
              setActiveTab('coach');
              setCoachSubTab('teams');
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
                      openConfigModalForTeam(activePlayerTeam);
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
                medalsByPlayer={medalsByPlayer}
                userStatsMap={userStatsMap}
                userDetailsMap={userDetailsMap}
                nowMs={nowMs}
                selectedTeamId={coachAnalyticsTeamFilter}
                onSelectTeamId={setCoachAnalyticsTeamFilter}
                onOpenTeamConfig={team => openConfigModalForTeam(team)}
                onTogglePriorityFocus={handleTogglePriorityFocus}
                onSelectPlayerDetail={handleSelectPlayerDetail}
                onLoadAllAttempts={handleLoadAllAttempts}
                isLoadingAllAttempts={isLoadingAllAttempts}
                allAttemptsLoaded={allAttemptsLoaded}
              />
            ) : coachSubTab === 'teams' ? (
              <CoachTeamsView
                teams={teams}
                players={players}
                questions={questions}
                medalsByPlayer={medalsByPlayer}
                nowMs={nowMs}
                selectedTeamId={coachSelectedTeamId}
                onSelectTeamId={setCoachSelectedTeamId}
                onCreateTeam={name => createTeamInFirestore(name, firebaseUser.uid, quizConfig)}
                onUpdateTeam={(teamId, updates) => updateTeamInFirestore(teamId, updates)}
                onSetDefaultTeam={teamId => setDefaultTeamInFirestore(teamId, teams)}
                onDeleteTeam={async teamId => {
                  await deleteTeamFromFirestore(teamId, questions);
                  const nowIso = new Date().toISOString();
                  const affected = questions
                    .filter(q => q.teamIds && q.teamIds.includes(teamId))
                    .map(q => {
                      const nextTeamIds = q.teamIds!.filter(id => id !== teamId);
                      return {
                        ...q,
                        teamIds: nextTeamIds.length > 0 ? nextTeamIds : undefined,
                        updatedAt: nowIso
                      };
                    });
                  if (affected.length > 0) {
                    setQuestions(prev => mergeQuestionsWithDelta(prev, affected));
                    upsertQuestionsInCache(QUESTIONS_CACHE_KEY, affected);
                  }
                  setTeams(prev => prev.filter(t => t.id !== teamId));
                }}
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
                players={players}
                attempts={attempts}
                userDetailsMap={userDetailsMap}
                selectedTeamFilter={coachQuestionsTeamFilter}
                onChangeTeamFilter={setCoachQuestionsTeamFilter}
                selectedPlayerFilter={coachQuestionsPlayerFilter}
                onChangePlayerFilter={setCoachQuestionsPlayerFilter}
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

      {/* Mobile Bottom Nav (only shown when Coach tab is available and no quiz is active) */}
      {isCoach && !isQuizActive && (
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
        medals={selectedPlayerForDetail ? medalsByPlayer.get(selectedPlayerForDetail.id) : undefined}
        cachedDetails={selectedPlayerForDetail ? userDetailsMap.get(selectedPlayerForDetail.id) ?? null : null}
        playerStats={selectedPlayerForDetail ? userStatsMap.get(selectedPlayerForDetail.id) ?? null : null}
        onDetailsLoaded={(userId, details) => {
          setUserDetailsMap(prev => {
            const next = new Map(prev);
            next.set(userId, details);
            return next;
          });
          upsertAggregateEntriesInCache(USER_DETAILS_CACHE_KEY, [details]);
        }}
        nowMs={nowMs}
        isOpen={isPlayerDetailOpen}
        onClose={() => {
          setIsPlayerDetailOpen(false);
          setSelectedPlayerForDetail(null);
        }}
        viewerIsCoach={isCoach}
        currentUserId={currentPlayer.id}
        onToggleRole={handleToggleMemberRole}
        onDeletePlayer={handleDeletePlayer}
        onTogglePriorityFocus={handleTogglePriorityFocus}
        onSwitchToQuestions={playerId => {
          setIsPlayerDetailOpen(false);
          setCoachQuestionsPlayerFilter(playerId);
          setActiveTab('coach');
          setCoachSubTab('questions');
        }}
      />

      <QuizResultsModal
        attempt={latestAttempt}
        questions={questions}
        player={currentPlayer}
        medals={medalsByPlayer.get(currentPlayer.id)}
        nowMs={nowMs}
        isOpen={isResultsOpen}
        onClose={() => setIsResultsOpen(false)}
        onRetake={() => {
          trackEvent('quiz_retake_click', {
            previous_passed: Boolean(latestAttempt?.passed)
          });
          setIsResultsOpen(false);
          handleStartQuiz();
        }}
        onGoToLeaderboard={() => {
          trackEvent('results_to_leaderboard_click', {
            previous_passed: Boolean(latestAttempt?.passed)
          });
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

      {/* Admin Document Reads Telemetry Widget (Bottom-Left) */}
      {currentPlayer.isAdmin && !isQuizActive && (
        <div
          className={`fixed ${
            isCoach ? 'bottom-20 md:bottom-4' : 'bottom-4'
          } left-4 z-30 pointer-events-none px-3.5 py-2 bg-black/90 border border-zinc-700/80 rounded-xl text-xs font-mono text-emerald-400 shadow-2xl backdrop-blur-md flex items-center gap-2.5`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>
            Firestore Reads: <strong className="text-white tabular-nums font-bold">{documentReadCount}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
