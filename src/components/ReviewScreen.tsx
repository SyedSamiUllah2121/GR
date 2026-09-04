'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  FileCheck,
  Eraser,
  Image as ImageIcon,
  PenTool,
} from 'lucide-react';
import { Answer, Inspection, Item } from '../types';
import { TEMPLATES } from '../data/templates';
import { ScorePill } from './ScorePill';
import {
  getInspectionById,
  saveInspection,
  clearActiveDraft,
} from '../services/storage';
import { useRouter } from 'next/navigation';
import { useToast } from './ToastProvider';

interface ReviewScreenProps {
  inspectionId: string;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({ inspectionId }) => {
  const router = useRouter();
  const showToast = useToast();
  const [inspection, setInspection] = useState<Inspection | null>(() =>
    getInspectionById(inspectionId)
  );
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!inspection) {
      const found = getInspectionById(inspectionId);
      if (found) setInspection(found);
    }
  }, [inspectionId, inspection]);

  // Set up signature canvas touch and mouse listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas scaling for sharp display on Retina/mobile screens
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#213B26';

    const getCanvasPos = (clientX: number, clientY: number) => {
      const b = canvas.getBoundingClientRect();
      return {
        x: clientX - b.left,
        y: clientY - b.top,
      };
    };

    const startDrawing = (x: number, y: number) => {
      isDrawingRef.current = true;
      lastPosRef.current = { x, y };
      ctx.beginPath();
      ctx.moveTo(x, y);
      setSignError(null);
    };

    const draw = (x: number, y: number) => {
      if (!isDrawingRef.current || !lastPosRef.current) return;
      ctx.lineTo(x, y);
      ctx.stroke();
      lastPosRef.current = { x, y };
      setHasDrawn(true);
    };

    const stopDrawing = () => {
      if (isDrawingRef.current) {
        ctx.closePath();
        isDrawingRef.current = false;
        lastPosRef.current = null;
      }
    };

    // Mouse handlers
    const handleMouseDown = (e: MouseEvent) => {
      const pos = getCanvasPos(e.clientX, e.clientY);
      startDrawing(pos.x, pos.y);
    };
    const handleMouseMove = (e: MouseEvent) => {
      const pos = getCanvasPos(e.clientX, e.clientY);
      draw(pos.x, pos.y);
    };
    const handleMouseUp = () => stopDrawing();
    const handleMouseLeave = () => stopDrawing();

    // Touch handlers with preventDefault to prevent scrolling while drawing
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        const pos = getCanvasPos(touch.clientX, touch.clientY);
        startDrawing(pos.x, pos.y);
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        const pos = getCanvasPos(touch.clientX, touch.clientY);
        draw(pos.x, pos.y);
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      stopDrawing();
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);

      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const handleClearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setSignError(null);
  };

  if (!inspection) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <h2 className="text-xl font-bold text-[#242217]">Inspection not found</h2>
        <button
          onClick={() => router.push('/inspections')}
          className="mt-4 px-4 py-2 bg-[#2F5233] text-white text-sm font-medium rounded-[6px]"
        >
          Return to records
        </button>
      </div>
    );
  }

  const template = TEMPLATES[inspection.templateKey];
  const allItems: Item[] = template.sections.flatMap((s) => s.items);
  const totalItemsCount = allItems.length;

  // Gather flagged (No) items
  const flaggedItems: { item: Item; answer: Answer }[] = [];
  let yesCount = 0;

  allItems.forEach((item) => {
    const ans = inspection.answers[item.id];
    if (ans?.status === 'yes') {
      yesCount++;
    } else if (ans?.status === 'no') {
      flaggedItems.push({ item, answer: ans });
    }
  });

  const calculatedScore = Math.round((yesCount / totalItemsCount) * 100);

  const handleSubmitInspection = () => {
    if (!hasDrawn) {
      setSignError('Please sign before submitting');
      return;
    }

    const canvas = canvasRef.current;
    const signatureDataUrl = canvas ? canvas.toDataURL('image/png') : null;

    const submittedInspection: Inspection = {
      ...inspection,
      status: 'submitted',
      score: calculatedScore,
      signature: signatureDataUrl,
    };

    saveInspection(submittedInspection);
    clearActiveDraft();

    showToast('Inspection saved');
    router.push(`/inspections/${inspection.id}`);
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto w-full">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#635E4F] hover:text-[#242217] transition cursor-pointer mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Return to checklist</span>
      </button>

      {/* Header */}
      <div className="mb-6 border-b border-[#DEDACB] pb-4">
        <h1 className="text-xl font-bold tracking-tight text-[#242217]">
          Review before submitting
        </h1>
        <p className="text-xs font-medium text-[#635E4F] mt-1">
          {flaggedItems.length === 0
            ? 'Every item passed'
            : `${flaggedItems.length} item${flaggedItems.length === 1 ? '' : 's'} flagged with a reason`}
          {' '}• {inspection.branchName} ({template.label})
        </p>
      </div>

      {/* Score Preview Banner */}
      <div className="mb-6 p-4 rounded-md bg-white border border-[#DEDACB] flex items-center justify-between shadow-xs">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#635E4F]">
            Calculated score
          </p>
          <p className="text-xs text-[#635E4F] mt-0.5">
            {yesCount} of {totalItemsCount} items passed standards
          </p>
        </div>
        <div className="text-right">
          <ScorePill score={calculatedScore} />
        </div>
      </div>

      {/* Flagged items list */}
      <div className="mb-8">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-3">
          Non-compliant items ({flaggedItems.length})
        </h2>

        {flaggedItems.length === 0 ? (
          <div className="p-6 bg-[#E7EEE4]/60 border border-[#2F5233]/20 rounded-md text-center">
            <CheckCircle className="w-8 h-8 text-[#2F5233] mx-auto mb-2" />
            <p className="text-sm font-bold text-[#2F5233]">Every item passed</p>
            <p className="text-xs text-[#2F5233]/80 mt-1">
              All checklist points conform to inspection guidelines.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {flaggedItems.map(({ item, answer }) => {
              const displayReason =
                answer.reason === 'Other'
                  ? `Other: ${answer.otherReason || 'Unspecified'}`
                  : answer.reason || 'No reason provided';

              return (
                <div
                  key={item.id}
                  id={`review-flagged-item-${item.id}`}
                  className="bg-[#F4E4DF]/40 border border-[#9C3B2E]/30 rounded-md p-4 text-[#242217]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="text-xs font-bold text-[#9C3B2E] bg-white border border-[#9C3B2E]/30 w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5">
                        {item.id}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[#242217]">{item.text}</p>
                        <div className="mt-1.5 text-xs">
                          <span className="font-semibold text-[#9C3B2E]">Reason: </span>
                          <span className="text-[#242217]">{displayReason}</span>
                        </div>
                        {answer.note && (
                          <div className="mt-1 text-xs text-[#635E4F]">
                            <span className="font-semibold">Note: </span>
                            <span>{answer.note}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {answer.photo && (
                      <div className="shrink-0">
                        <img
                          src={answer.photo}
                          alt={`Evidence item ${item.id}`}
                          className="w-14 h-14 object-cover rounded-md border border-[#DEDACB] bg-white"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Signature Pad Section */}
      <div className="bg-white border border-[#DEDACB] rounded-md p-6 mb-8 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <div>
            <label
              htmlFor="signature-canvas"
              className="block text-sm font-bold text-[#242217]"
            >
              Branch manager sign-off <span className="text-[#9C3B2E]">*</span>
            </label>
            <p className="text-xs text-[#635E4F] mt-0.5">
              Draw manager signature with touch or mouse to acknowledge this inspection.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClearSignature}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#635E4F] hover:text-[#9C3B2E] border border-[#DEDACB] rounded-md hover:bg-[#F5F3EC] transition-colors cursor-pointer"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>

        {signError && (
          <div
            id="signature-error-msg"
            className="mb-3 p-2.5 rounded-md bg-[#F4E4DF] border border-[#9C3B2E]/30 text-[#9C3B2E] text-xs font-semibold flex items-center gap-1.5"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{signError}</span>
          </div>
        )}

        <div className="relative border-2 border-dashed border-[#DEDACB] rounded-md bg-[#F9F8F4] overflow-hidden touch-none">
          <canvas
            id="signature-canvas"
            ref={canvasRef}
            className="w-full h-36 md:h-44 cursor-crosshair block"
          />
          {!hasDrawn && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs text-[#635E4F]/50">
              <PenTool className="w-4 h-4 mr-1.5 opacity-60" />
              Sign here using mouse or finger
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/inspections/${inspection.id}/checklist`)}
          className="px-4 py-2.5 border border-[#DEDACB] rounded-md text-xs font-semibold text-[#635E4F] hover:text-[#242217] bg-white hover:bg-[#F5F3EC] transition-colors cursor-pointer"
        >
          Edit checklist
        </button>

        <button
          id="submit-inspection-btn"
          type="button"
          onClick={handleSubmitInspection}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-md text-xs font-semibold bg-[#2F5233] text-white hover:bg-[#3d6a42] transition-colors shadow-xs cursor-pointer"
        >
          <FileCheck className="w-4 h-4" />
          <span>Submit inspection</span>
        </button>
      </div>
    </div>
  );
};
