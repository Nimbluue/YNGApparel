/**
 * Stepper / Timeline — menampilkan 5 tahap produksi.
 * Dipakai di halaman Tracker, Pesanan Saya, dan Detail Order Admin.
 */
import {
  PRODUCTION_STATUS,
  FULFILLMENT_TYPE,
  getProductionStatusLabel,
  type ProductionStatus,
  type FulfillmentType,
} from '@yng/shared';

const ORDERED_STEPS: ProductionStatus[] = [
  PRODUCTION_STATUS.NEW_ORDER,
  PRODUCTION_STATUS.PRINT_QUEUE,
  PRODUCTION_STATUS.PRESSING_QC,
  PRODUCTION_STATUS.AWAITING_SETTLEMENT,
  PRODUCTION_STATUS.SHIPPING,
];

function getStepIndex(status: ProductionStatus): number {
  if (status === PRODUCTION_STATUS.COMPLETED) return ORDERED_STEPS.length;
  if (status === PRODUCTION_STATUS.CANCELLED) return -1;
  return ORDERED_STEPS.indexOf(status);
}

interface StepperProps {
  currentStatus: ProductionStatus;
  fulfillmentType?: FulfillmentType;
  className?: string;
}

export function ProductionStepper({
  currentStatus,
  fulfillmentType = FULFILLMENT_TYPE.SHIP,
  className = '',
}: StepperProps) {
  const currentIndex = getStepIndex(currentStatus);
  const isCancelled = currentStatus === PRODUCTION_STATUS.CANCELLED;

  return (
    <ol
      className={`relative border-l-4 border-line-strong pl-5 ${className}`}
      aria-label="Tahap produksi"
    >
      {ORDERED_STEPS.map((step, idx) => {
        const isDone = !isCancelled && currentIndex > idx;
        const isActive = !isCancelled && currentIndex === idx;
        const isSkipped =
          step === PRODUCTION_STATUS.AWAITING_SETTLEMENT && !isCancelled && currentIndex > idx; // Pelunasan bisa dilewati jika remaining=0

        const label = getProductionStatusLabel(step, fulfillmentType);

        return (
          <li key={step} className="flex gap-4 pb-6 last:pb-0">
            {/* Connector line */}
            <div className="flex flex-col items-center">
              <div
                className={`-ml-[1.85rem] flex h-8 w-8 shrink-0 items-center justify-center border-2 font-mono text-xs ${
                  isCancelled
                    ? 'border-muted text-muted'
                    : isDone
                      ? 'border-ink bg-ink text-bone'
                      : isActive
                        ? 'border-accent bg-accent text-ink'
                        : 'border-line text-muted'
                }`}
                aria-hidden="true"
              >
                {isDone ? '✓' : idx + 1}
              </div>
              {idx < ORDERED_STEPS.length - 1 && (
                <div
                  className={`mt-1 w-1 flex-1 ${isDone ? 'bg-ink' : 'bg-line'}`}
                  aria-hidden="true"
                />
              )}
            </div>

            {/* Label */}
            <div className="pb-1">
              <p
                className={`font-display text-base font-bold ${
                  isCancelled
                    ? 'text-muted'
                    : isActive
                      ? 'text-ink'
                      : isDone
                        ? 'text-ink'
                        : 'text-muted'
                }`}
              >
                {label}
                {isSkipped && (
                  <span className="ml-2 font-mono text-[10px] normal-case tracking-normal text-muted">
                    (dilewati)
                  </span>
                )}
              </p>
              {isActive && !isCancelled && (
                <p className="mt-0.5 font-mono text-[11px] text-status-warn">● Tahap saat ini</p>
              )}
            </div>
          </li>
        );
      })}

      {/* Completed & Cancelled */}
      {currentStatus === PRODUCTION_STATUS.COMPLETED && (
        <li className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="-ml-[1.85rem] flex h-8 w-8 shrink-0 items-center justify-center border-2 border-status-ok bg-status-ok font-mono text-xs text-white">
              ✓
            </div>
          </div>
          <div>
            <p className="font-display text-base font-bold text-status-ok">Selesai</p>
          </div>
        </li>
      )}
      {isCancelled && (
        <li className="mt-2 flex gap-4">
          <div className="-ml-[1.85rem] flex h-8 w-8 shrink-0 items-center justify-center border-2 border-status-err bg-bone font-mono text-xs text-status-err">
            ✕
          </div>
          <div>
            <p className="font-display text-base font-bold text-status-err">Dibatalkan</p>
          </div>
        </li>
      )}
    </ol>
  );
}
