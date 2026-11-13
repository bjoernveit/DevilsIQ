import React, { useState, useEffect } from 'react';
import { Question, QuizOption } from '../types/basketball';
import { X, Plus, Trash2, Check, Star, Image as ImageIcon } from 'lucide-react';

interface QuestionEditorModalProps {
  question?: Question | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (question: Question) => void;
  existingTags: string[];
  onRemoveTopicLabel?: (tag: string) => Promise<void>;
}

function compressImageFile(file: File, onLoaded: (dataUrl: string) => void) {
  const reader = new FileReader();
  reader.onload = () => {
    const raw = reader.result;
    if (typeof raw !== 'string') return;

    const img = new Image();
    img.onload = () => {
      const maxDim = 1000;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        onLoaded(raw);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', 0.8);
      onLoaded(compressed.length < raw.length ? compressed : raw);
    };
    img.onerror = () => onLoaded(raw);
    img.src = raw;
  };
  reader.readAsDataURL(file);
}

const DEFAULT_OPTIONS: QuizOption[] = [
  { id: 'opt-1', text: '', isCorrect: true },
  { id: 'opt-2', text: '', isCorrect: false },
  { id: 'opt-3', text: '', isCorrect: false }
];

export const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
  question,
  isOpen,
  onClose,
  onSave,
  existingTags,
  onRemoveTopicLabel
}) => {
  const [promptText, setPromptText] = useState(
    question?.scenario || question?.title || ''
  );
  const [imageUrl, setImageUrl] = useState(question?.imageUrl || '');
  const [isPriorityFocus, setIsPriorityFocus] = useState(
    question?.isPriorityFocus ?? false
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(question?.tags ?? []);
  const [newTagInput, setNewTagInput] = useState('');
  const [options, setOptions] = useState<QuizOption[]>(
    question?.options && question.options.length >= 2
      ? question.options
      : DEFAULT_OPTIONS
  );

  useEffect(() => {
    if (isOpen) {
      setPromptText(question?.scenario || question?.title || '');
      setImageUrl(question?.imageUrl || '');
      setIsPriorityFocus(question?.isPriorityFocus ?? false);
      setSelectedTags(question?.tags ?? []);
      setNewTagInput('');
      setOptions(
        question?.options && question.options.length >= 2
          ? question.options
          : DEFAULT_OPTIONS.map(o => ({ ...o }))
      );
    }
  }, [isOpen, question]);

  if (!isOpen) return null;

  const handleToggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleAddNewTag = () => {
    const trimmed = newTagInput.trim();
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags([...selectedTags, trimmed]);
      setNewTagInput('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt) return;

    const validatedOptions = options.map((opt, idx) => ({
      id: opt.id,
      text: opt.text.trim() || `Antwort ${String.fromCharCode(65 + idx)}`,
      isCorrect: opt.isCorrect,
      ...(opt.imageUrl ? { imageUrl: opt.imageUrl } : {})
    }));

    const shortTitle =
      trimmedPrompt.length > 150
        ? `${trimmedPrompt.slice(0, 147)}...`
        : trimmedPrompt;

    const updated: Question = {
      id: question?.id || `q-${Date.now()}`,
      title: shortTitle,
      scenario: trimmedPrompt,
      keyConcept: shortTitle,
      isPriorityFocus,
      tags: selectedTags,
      explanation: '',
      options: validatedOptions,
      imageUrl: imageUrl.trim() ? imageUrl.trim() : undefined,
      createdAt: question?.createdAt || new Date().toISOString()
    };

    onSave(updated);
    onClose();
  };

  const combinedTagList = Array.from(new Set([...existingTags, ...selectedTags]));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-base font-bold text-white">
            {question ? 'Frage bearbeiten' : 'Neue Frage'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label="Dialog schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {/* Single Text Prompt */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Frage *
            </label>
            <textarea
              required
              rows={3}
              maxLength={1000}
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
              placeholder="z. B. Wie verhalten wir uns beim Pick & Roll gegen Drop Coverage?"
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-red-600 resize-none"
            />
          </div>

          {/* Optional Image */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">
                Bild (optional)
              </span>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="text-xs font-medium text-red-400 hover:text-red-300"
                >
                  Bild entfernen
                </button>
              )}
            </div>

            {imageUrl && (
              <div className="rounded-lg overflow-hidden border border-zinc-800 bg-black max-h-48">
                <img
                  src={imageUrl}
                  alt="Vorschau"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain max-h-48"
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={imageUrl.startsWith('data:') ? '' : imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="Bild-URL einfügen..."
                className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-600 min-h-[38px]"
              />
              <label className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-xs font-medium text-zinc-200 cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-[38px] shrink-0 transition-colors">
                <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
                <span>Bild hochladen</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) compressImageFile(file, setImageUrl);
                  }}
                />
              </label>
            </div>
          </div>

          {/* Priority Focus */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
            <div>
              <span className="text-xs font-semibold text-white">Trainingsfokus</span>
              <p className="text-[11px] text-zinc-400">
                Diese Frage erscheint häufiger im Wochen-Quiz
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPriorityFocus(!isPriorityFocus)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 min-h-[38px] border transition-colors ${
                isPriorityFocus
                  ? 'bg-red-950/70 border-red-700/70 text-red-200'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-300'
              }`}
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  isPriorityFocus ? 'fill-red-500 text-red-500' : 'text-zinc-500'
                }`}
              />
              <span>{isPriorityFocus ? 'Priorisiert' : 'Standard'}</span>
            </button>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Themen-Labels
            </label>
            <div className="flex flex-wrap gap-1.5">
              {combinedTagList.map(tag => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <div
                    key={tag}
                    className={`inline-flex items-center text-xs rounded-lg border transition-colors min-h-[32px] ${
                      isSelected
                        ? 'bg-red-700 border-red-700 text-white font-medium'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleTag(tag)}
                      className="px-2.5 py-1"
                    >
                      {tag}
                    </button>
                    {onRemoveTopicLabel && (
                      <button
                        type="button"
                        onClick={async () => {
                          setSelectedTags(prev => prev.filter(t => t !== tag));
                          await onRemoveTopicLabel(tag);
                        }}
                        aria-label={`Label ${tag} löschen`}
                        title={`„${tag}“ aus den Team-Labels entfernen`}
                        className={`pr-2 pl-0.5 py-1 flex items-center justify-center ${
                          isSelected
                            ? 'text-red-200 hover:text-white'
                            : 'text-zinc-400 hover:text-red-400'
                        }`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={newTagInput}
                onChange={e => setNewTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddNewTag();
                  }
                }}
                placeholder="Neues Label..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-600"
              />
              <button
                type="button"
                onClick={handleAddNewTag}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
              >
                Hinzufügen
              </button>
            </div>
          </div>

          {/* Answer Options */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">
                Antwortmöglichkeiten (Kreis für richtige Antwort antippen)
              </label>
              {options.length < 4 && (
                <button
                  type="button"
                  onClick={() =>
                    setOptions([
                      ...options,
                      { id: `opt-${Date.now()}`, text: '', isCorrect: false }
                    ])
                  }
                  className="text-xs font-medium text-red-400 hover:text-red-300 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Antwort hinzufügen
                </button>
              )}
            </div>

            {options.map((opt, idx) => (
              <div
                key={opt.id}
                className={`p-3 rounded-xl border space-y-2 ${
                  opt.isCorrect
                    ? 'bg-emerald-950/35 border-emerald-600'
                    : 'bg-zinc-950 border-zinc-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setOptions(options.map(o => ({ ...o, isCorrect: o.id === opt.id })))
                    }
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${
                      opt.isCorrect
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-zinc-700 text-transparent'
                    }`}
                    aria-label={`Antwort ${String.fromCharCode(65 + idx)} als richtig markieren`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </button>

                  <input
                    type="text"
                    required
                    value={opt.text}
                    onChange={e =>
                      setOptions(
                        options.map(o =>
                          o.id === opt.id ? { ...o, text: e.target.value } : o
                        )
                      )
                    }
                    placeholder={`Antwort ${String.fromCharCode(65 + idx)}`}
                    className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none"
                  />

                  <label
                    className={`p-1.5 rounded-lg cursor-pointer ${
                      opt.imageUrl
                        ? 'text-red-400 bg-red-950/70'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                    title="Bild für diese Antwort hochladen"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          compressImageFile(file, url =>
                            setOptions(prev =>
                              prev.map(o =>
                                o.id === opt.id ? { ...o, imageUrl: url } : o
                              )
                            )
                          );
                        }
                      }}
                    />
                  </label>

                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        const filtered = options.filter(o => o.id !== opt.id);
                        if (!filtered.some(o => o.isCorrect)) filtered[0].isCorrect = true;
                        setOptions(filtered);
                      }}
                      className="p-1.5 text-zinc-500 hover:text-red-400"
                      aria-label="Antwort entfernen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {opt.imageUrl && (
                  <div className="flex items-center gap-2 pt-1">
                    <img
                      src={opt.imageUrl}
                      alt="Antwort-Bild"
                      referrerPolicy="no-referrer"
                      className="max-h-24 rounded-lg border border-zinc-800 bg-black"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setOptions(prev =>
                          prev.map(o =>
                            o.id === opt.id ? { ...o, imageUrl: undefined } : o
                          )
                        )
                      }
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Entfernen
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-zinc-800 bg-zinc-950">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 text-xs font-semibold min-h-[42px] transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white font-semibold text-xs min-h-[42px] transition-colors"
          >
            {question ? 'Änderungen speichern' : 'Frage hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  );
};
