import { Fragment } from "react";

interface Step {
  id: string;
  label: string;
}

interface Props {
  steps: Step[];
  currentIndex: number;
}

export function WizardSteps({ steps, currentIndex }: Props) {
  return (
    <div className="steps">
      {steps.map((step, i) => {
        const status =
          i < currentIndex
            ? "step-done"
            : i === currentIndex
            ? "step-active"
            : "step-inactive";
        return (
          <Fragment key={step.id}>
            <div className={"step " + status}>
              <div className="step-num">{i < currentIndex ? "✓" : i + 1}</div>
              <div className="step-label">{step.label}</div>
            </div>
            {i < steps.length - 1 && <div className="step-line" />}
          </Fragment>
        );
      })}
    </div>
  );
}
