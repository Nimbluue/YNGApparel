/**
 * Stepper / Timeline — menampilkan 5 tahap produksi.
 * Dipakai di halaman Tracker, Pesanan Saya, dan Detail Order Admin.
 */
import {
  FULFILLMENT_TYPE,
  PRODUCTION_STATUS,
  getProductionStatusLabel,
  type FulfillmentType,
  type ProductionStatus,
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
    <ol className={`relative space-y-4 pl-2 ${className}`} aria-label="Tahap produksi">
      {ORDERED_STEPS.map((step, idx) => {
        const isDone = !isCancelled && currentIndex > idx;
        const isActive = !isCancelled && currentIndex === idx;
        const isSkipped =
          step === PRODUCTION_STATUS.AWAITING_SETTLEMENT && !isCancelled && currentIndex > idx;

        const label = getProductionStatusLabel(step, fulfillmentType);

        return (
          <li key={step} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums ${
                  isCancelled
                    ? 'border-line bg-surface text-muted'
                    : isDone
                      ? 'border-ink bg-ink text-white'
                      : isActive
                        ? 'border-ink bg-surface text-ink ring-2 ring-ink/15'
                        : 'border-line bg-white text-muted'
                }`}
                aria-hidden="true"
              >
                {isDone ? '✓' : idx + 1}
              </div>
              {idx < ORDERED_STEPS.length - 1 && (
                <div
                  className={`mt-1 w-0.5 flex-1 ${isDone ? 'bg-ink' : 'bg-line'}`}
                  aria-hidden="true"
                />
              )}
            </div>

            <div className="pb-4">
              <p
                className={`font-display text-sm font-semibold ${
                  isCancelled ? 'text-muted' : isActive || isDone ? 'text-ink' : 'text-muted'
                }`}
              >
                {label}
                {isSkipped && (
                  <span className="ml-2 text-xs font-normal text-muted">(dilewati)</span>
                )}
              </p>
              {isActive && !isCancelled && (
                <p className="mt-0.5 text-xs font-medium text-status-warn">● Tahap saat ini</p>
              )}
            </div>
          </li>
        );
      })}

      {currentStatus === PRODUCTION_STATUS.COMPLETED && (
        <li className="flex items-center gap-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-status-ok bg-status-ok text-xs tabular-nums text-white">
            ✓
          </div>
          <p className="font-display text-sm font-semibold text-status-ok">Selesai</p>
        </li>
      )}
      {isCancelled && (
        <li className="flex items-center gap-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-status-err bg-red-50 text-xs tabular-nums text-status-err">
            ✕
          </div>
          <p className="font-display text-sm font-semibold text-status-err">Dibatalkan</p>
        </li>
      )}
    </ol>
  );
}
