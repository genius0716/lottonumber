/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Sparkles, Volume2, VolumeX, Bookmark, Trash2, X, Share2, Check, ExternalLink } from 'lucide-react';
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Sample Historical Data (Real recent data)
const HISTORICAL_DATA = [
  { round: 1164, date: '2025-03-22', numbers: [1, 10, 16, 27, 35, 41], bonus: 14 },
  { round: 1163, date: '2025-03-15', numbers: [3, 11, 15, 22, 37, 44], bonus: 25 },
  { round: 1162, date: '2025-03-08', numbers: [1, 11, 14, 25, 33, 40], bonus: 34 },
  { round: 1161, date: '2025-03-01', numbers: [4, 11, 15, 23, 25, 40], bonus: 39 },
  { round: 1160, date: '2025-02-22', numbers: [2, 10, 14, 22, 32, 36], bonus: 41 },
];

// Sound utility using Web Audio API
const playSound = (type: 'click' | 'pop', index: number = 0) => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'pop') {
      const freq = 440 + (index * 110);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    console.warn('Audio context failed to initialize', e);
  }
};

export default function App() {
  const [numbers, setNumbers] = useState<number[]>([]);
  const [reasoning, setReasoning] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [savedSets, setSavedSets] = useState<{ id: string; numbers: number[]; date: string }[]>([]);
  const [isSavedListOpen, setIsSavedListOpen] = useState(false);
  const [showCopiedToast, setShowCopiedToast] = useState(false);

  // Load saved sets from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('lotto_saved_sets');
    if (saved) {
      try {
        setSavedSets(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved sets', e);
      }
    }
  }, []);

  // Save sets to localStorage
  useEffect(() => {
    localStorage.setItem('lotto_saved_sets', JSON.stringify(savedSets));
  }, [savedSets]);

  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch('/api/lotto/history');
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const validateLottoNumbers = (nums: number[]): { isValid: boolean; message?: string } => {
    if (!Array.isArray(nums) || nums.length !== 6) {
      return { isValid: false, message: "번호가 6개가 아닙니다." };
    }
    
    const uniqueNumbers = new Set(nums);
    
    if (uniqueNumbers.size !== 6) {
      return { isValid: false, message: "중복된 번호가 포함되어 있습니다." };
    }
    
    const outOfRange = nums.some(n => n < 1 || n > 45);
    if (outOfRange) {
      return { isValid: false, message: "1에서 45 사이의 범위를 벗어난 번호가 있습니다." };
    }
    
    return { isValid: true };
  };

  const generateNumbers = useCallback(async () => {
    if (soundEnabled) playSound('click');
    
    setIsGenerating(true);
    setNumbers([]);
    setReasoning('');
    
    try {
      const currentHistory = history.length > 0 ? history.slice(0, 10) : HISTORICAL_DATA;
      const historyStr = currentHistory.map(d => `Round ${d.round}: ${d.numbers.join(', ')}`).join('\n');
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze these Lotto numbers: ${historyStr}. Predict 6 numbers for the next draw. Return JSON with 'numbers' (array) and 'reasoning' (brief Korean text).`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              numbers: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
                description: "6 unique numbers between 1 and 45"
              },
              reasoning: {
                type: Type.STRING,
                description: "Brief analysis reasoning in Korean"
              }
            },
            required: ["numbers", "reasoning"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      if (result.numbers && Array.isArray(result.numbers)) {
        const validation = validateLottoNumbers(result.numbers);
        
        if (validation.isValid) {
          setNumbers(result.numbers.sort((a: number, b: number) => a - b));
          setReasoning(result.reasoning || '');
        } else {
          throw new Error(`AI 검증 실패: ${validation.message}`);
        }
      } else {
        throw new Error('AI 응답 형식이 올바르지 않습니다.');
      }
    } catch (error) {
      console.error('AI Generation failed:', error);
      
      const fallback: number[] = [];
      while (fallback.length < 6) {
        const num = Math.floor(Math.random() * 45) + 1;
        if (!fallback.includes(num)) fallback.push(num);
      }
      setNumbers(fallback.sort((a, b) => a - b));
      
      const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
      setReasoning(`AI 분석 중 오류가 발생했습니다 (${errorMsg}). 안전을 위해 무작위 번호를 생성했습니다.`);
    } finally {
      setIsGenerating(false);
    }
  }, [soundEnabled, history]);

  useEffect(() => {
    if (numbers.length === 6 && soundEnabled) {
      numbers.forEach((_, idx) => {
        setTimeout(() => {
          playSound('pop', idx);
        }, idx * 30);
      });
    }
  }, [numbers, soundEnabled]);

  const getBallColor = (num: number) => {
    if (num <= 10) return 'bg-yellow-400 text-black';
    if (num <= 20) return 'bg-blue-500 text-white';
    if (num <= 30) return 'bg-red-500 text-white';
    if (num <= 40) return 'bg-gray-500 text-white';
    return 'bg-green-500 text-white';
  };

  const saveCurrentSet = () => {
    if (numbers.length === 6) {
      // Check if already saved
      const isDuplicate = savedSets.some(set => 
        JSON.stringify(set.numbers) === JSON.stringify(numbers)
      );

      if (isDuplicate) {
        alert('이미 저장된 번호 조합입니다.');
        return;
      }

      const newSet = {
        id: Date.now().toString(),
        numbers: [...numbers],
        date: new Date().toLocaleDateString()
      };
      setSavedSets(prev => [newSet, ...prev]);
      if (soundEnabled) playSound('click');
    }
  };

  const deleteSavedSet = (id: string) => {
    setSavedSets(prev => prev.filter(set => set.id !== id));
    if (soundEnabled) playSound('click');
  };

  const handleShare = async () => {
    if (numbers.length !== 6) return;

    const shareText = `[AI 행운 번호 분석기] 이번 주 추천 번호: ${numbers.join(', ')}\n\nAI가 분석한 행운의 번호를 확인해보세요!`;
    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AI 행운 번호 분석기',
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        console.error('Sharing failed:', err);
      }
    } else {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        setShowCopiedToast(true);
        setTimeout(() => setShowCopiedToast(false), 2000);
        if (soundEnabled) playSound('click');
      } catch (err) {
        console.error('Clipboard copy failed:', err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-[32px] shadow-sm border border-gray-100 p-8 flex flex-col items-center relative overflow-hidden">
        
        {/* Top Controls */}
        <div className="absolute top-8 right-8 flex items-center gap-2 z-10">
          <button 
            onClick={() => setIsSavedListOpen(true)}
            className="p-2 text-gray-400 hover:text-indigo-600 transition-colors relative"
            aria-label="View saved numbers"
          >
            <Bookmark size={20} />
            {savedSets.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white" />
            )}
          </button>
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
            aria-label={soundEnabled ? "Mute sound" : "Unmute sound"}
          >
            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>

        <div className="w-full flex flex-col items-center">
          <header className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-50 rounded-2xl mb-4">
              <Sparkles className="text-indigo-600 w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AI 행운 번호 분석기</h1>
            <div className="mt-3 px-4 py-2 bg-indigo-50 rounded-xl border border-indigo-100">
              <p className="text-[13px] text-indigo-700 leading-relaxed font-medium">
                역대 당첨 데이터를 학습한 AI가 패턴을 분석하여<br />
                가장 균형 잡힌 행운의 조합을 제안합니다
              </p>
            </div>
          </header>

          {/* Main Numbers Row */}
          <div className="flex flex-wrap justify-center gap-3 mb-10 min-h-[64px]">
            <AnimatePresence mode="popLayout">
              {numbers.length > 0 ? (
                numbers.map((num, idx) => (
                  <motion.div
                    key={`${num}-${idx}`}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 300, 
                      damping: 25,
                      delay: idx * 0.02 
                    }}
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-lg sm:text-xl font-bold shadow-md ${getBallColor(num)}`}
                  >
                    {num}
                  </motion.div>
                ))
              ) : (
                !isGenerating && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3"
                  >
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gray-100 border-2 border-dashed border-gray-200" />
                    ))}
                  </motion.div>
                )
              )}
            </AnimatePresence>
            
            {isGenerating && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3"
              >
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      scale: [1, 1.1, 1],
                      backgroundColor: ["#f3f4f6", "#e5e7eb", "#f3f4f6"]
                    }}
                    transition={{ 
                      repeat: Infinity, 
                      duration: 0.6,
                      delay: i * 0.1
                    }}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gray-100"
                  />
                ))}
              </motion.div>
            )}
          </div>

          {/* Action Buttons Row */}
          <AnimatePresence>
            {numbers.length > 0 && !isGenerating && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-4 mb-8"
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold text-gray-500 hover:text-indigo-600 bg-gray-50 transition-all"
                  >
                    <Share2 size={14} />
                    공유하기
                  </button>
                  <button
                    onClick={saveCurrentSet}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold text-indigo-600 bg-indigo-50 transition-all"
                  >
                    <Bookmark size={14} fill={savedSets.some(s => JSON.stringify(s.numbers) === JSON.stringify(numbers)) ? "currentColor" : "none"} />
                    번호 저장
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={generateNumbers}
            disabled={isGenerating}
            className={`w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-semibold transition-all active:scale-95 ${
              isGenerating 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'
            }`}
          >
            <RefreshCw className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`} />
            {isGenerating ? 'AI 분석 중...' : (numbers.length > 0 ? 'AI 분석 번호 다시 받기' : 'AI 분석 번호 받기')}
          </button>
        </div>

        <footer className="mt-8 text-center w-full flex flex-col items-center gap-4">
          <a 
            href="https://www.dhlottery.co.kr/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl transition-all hover:scale-105"
          >
            <ExternalLink size={14} />
            동행복권 공식 사이트 방문하기
          </a>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">
            Lottery Number Generator • 6/45
          </p>
        </footer>
      </div>
      
      {/* Saved Numbers Sidebar/Overlay */}
      <AnimatePresence>
        {isSavedListOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSavedListOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-bottom border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bookmark className="text-indigo-600 w-5 h-5" />
                  <h2 className="text-lg font-bold text-gray-900">저장된 번호</h2>
                </div>
                <button 
                  onClick={() => setIsSavedListOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {savedSets.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                    <Bookmark size={48} className="mb-4" />
                    <p className="text-sm font-medium">저장된 번호가 없습니다.<br />마음에 드는 번호를 저장해보세요!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {savedSets.map((set) => (
                      <div 
                        key={set.id} 
                        className="bg-gray-50 rounded-2xl p-4 border border-gray-100 group"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{set.date}</span>
                          </div>
                          <button 
                            onClick={() => deleteSavedSet(set.id)}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1.5">
                            {set.numbers.map((n, i) => (
                              <div key={i} className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shadow-sm ${getBallColor(n)}`}>
                                {n}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Copied Toast */}
      <AnimatePresence>
        {showCopiedToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-xl z-[100]"
          >
            <Check size={14} className="text-green-400" />
            클립보드에 복사되었습니다!
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-6 text-xs text-gray-400">
        ※ 본 앱은 재미를 위한 번호 생성기이며 실제 당첨과는 무관합니다.
      </p>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
}
