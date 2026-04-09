import React from 'react';
import { CheckCircle2, Loader2, Circle, AlertCircle } from 'lucide-react';
import { TranscriptionStep } from '../types';

interface StepBubblesProps {
  steps: TranscriptionStep[];
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'done': return <CheckCircle2 className="w-9 h-9 sm:w-10 sm:h-10 text-green-500" />;
    case 'active': return <Loader2 className="w-9 h-9 sm:w-10 sm:h-10 text-blue-500 animate-spin" />;
    case 'error': return <AlertCircle className="w-9 h-9 sm:w-10 sm:h-10 text-red-500" />;
    default: return <Circle className="w-9 h-9 sm:w-10 sm:h-10 text-slate-300" />;
  }
};

const stepNumber = (index: number) => (
  <span className="text-lg sm:text-xl text-slate-400 font-bold w-8 text-center shrink-0">{index + 1}</span>
);

export const StepBubbles: React.FC<StepBubblesProps> = ({ steps }) => {
  return (
    <div className="flex flex-col gap-3 sm:gap-4 w-full max-w-2xl px-2">
      {steps.map((step, i) => (
        <React.Fragment key={step.id}>
          <div
            className={`
              flex items-center gap-4 sm:gap-5 px-5 py-4 sm:px-7 sm:py-5 rounded-2xl border-2 transition-all
              ${step.status === 'active' ? 'bg-blue-50 border-blue-300 shadow-md' : ''}
              ${step.status === 'done' ? 'bg-green-50 border-green-200' : ''}
              ${step.status === 'error' ? 'bg-red-50 border-red-300' : ''}
              ${step.status === 'pending' ? 'bg-slate-50 border-slate-200 opacity-50' : ''}
            `}
          >
            {stepNumber(i)}
            <div className="shrink-0">{statusIcon(step.status)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xl sm:text-2xl font-bold text-slate-700">{step.label}</p>
              {step.detail && (
                <p className="text-lg sm:text-xl text-slate-500 mt-1">{step.detail}</p>
              )}
            </div>
          </div>
          {/* Connector line between steps */}
          {i < steps.length - 1 && (
            <div className="flex justify-center">
              <div className={`w-1 h-5 sm:h-6 rounded-full ${
                step.status === 'done' ? 'bg-green-300' : 'bg-slate-200'
              }`} />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
