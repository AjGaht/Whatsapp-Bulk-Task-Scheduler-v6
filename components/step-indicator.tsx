"use client";

import { Check } from "lucide-react";

interface Step {
  id: number;
  title: string;
  description: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  /** Furthest step the user may jump forward to (prerequisites met). */
  maxReachableStep: number;
  onStepChange?: (step: number) => void;
}

function stepIsReachable(
  targetId: number,
  currentStep: number,
  maxReachableStep: number,
): boolean {
  if (targetId < currentStep) return true;
  return targetId <= maxReachableStep;
}

export function StepIndicator({
  steps,
  currentStep,
  maxReachableStep,
  onStepChange,
}: StepIndicatorProps) {
  return (
    <div className="relative">
      {/* Progress Line */}
      <div className="absolute top-5 left-5 right-5 h-0.5 bg-border">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{
            width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
          }}
        />
      </div>

      {/* Steps */}
      <div className="relative flex justify-between">
        {steps.map((step) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const reachable = stepIsReachable(
            step.id,
            currentStep,
            maxReachableStep,
          );
          const clickable =
            !!onStepChange && !isCurrent && reachable;

          const circleClass = `
                  relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all
                  ${
                    isCompleted
                      ? "bg-primary border-primary"
                      : isCurrent
                        ? "bg-background border-primary"
                        : "bg-secondary border-border"
                  }
                `;

          return (
            <div
              key={step.id}
              className="flex flex-col items-center text-center"
            >
              {onStepChange && clickable ? (
                <button
                  type="button"
                  onClick={() => onStepChange(step.id)}
                  aria-label={`Go to step ${step.id}: ${step.title}`}
                  className={`${circleClass} cursor-pointer hover:opacity-90 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5 text-primary-foreground" />
                  ) : (
                    <span
                      className={`text-sm font-medium ${
                        isCurrent ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {step.id}
                    </span>
                  )}
                </button>
              ) : onStepChange && !isCurrent && !reachable ? (
                <div
                  title="Complete earlier steps first"
                  className={`${circleClass} cursor-not-allowed opacity-50`}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5 text-primary-foreground" />
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">
                      {step.id}
                    </span>
                  )}
                </div>
              ) : (
                <div
                  className={circleClass}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5 text-primary-foreground" />
                  ) : (
                    <span
                      className={`text-sm font-medium ${
                        isCurrent ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {step.id}
                    </span>
                  )}
                </div>
              )}

              {onStepChange && clickable ? (
                <button
                  type="button"
                  onClick={() => onStepChange(step.id)}
                  className="mt-3 max-w-24 rounded-md px-1 py-0.5 text-center transition-colors hover:bg-accent/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <p
                    className={`text-sm font-medium ${
                      isCurrent ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 hidden md:block">
                    {step.description}
                  </p>
                </button>
              ) : onStepChange && !isCurrent && !reachable ? (
                <div
                  className="mt-3 max-w-24 cursor-not-allowed opacity-50"
                  title="Complete earlier steps first"
                >
                  <p className="text-sm font-medium text-muted-foreground">
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 hidden md:block">
                    {step.description}
                  </p>
                </div>
              ) : (
                <div className="mt-3 max-w-24">
                  <p
                    className={`text-sm font-medium ${
                      isCurrent ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 hidden md:block">
                    {step.description}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
