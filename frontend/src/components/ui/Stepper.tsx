/**
 * Stepper / Timeline — menampilkan 5 tahap produksi.
 * Mendukung array `stages` langsung dari server (`TrackerOrderDto.stages`) maupun fallback dari status enum.
 */
import {
  FULFILLMENT_TYPE,
  PRODUCTION_STATUS,
  getProductionStatusLabel,
  type FulfillmentType,
  type ProductionStatus,
  type TrackerProductionStageDto,
  type TrackerStageKey,
  type TrackerStageState,
} from '@yng/shared';

const ORDERED_STEPS: readonly TrackerStageKey[] = [
  PRODUCTION_STATUS.NEW_ORDER,
  PRODUCTION_STATUS.PRINT_QUEUE,
  PRODUCTION_STATUS.PRESSING_QC,
  PRODUCTION_STATUS.AWAITING_SETTLEMENT,
  PRODUCTION_STATUS.SHIPPING,
];

function buildFallbackStages(
  currentStatus: ProductionStatus,
  fulfillmentType: FulfillmentType
): TrackerProductionStageDto[] {
  const isCancelled = currentStatus === PRODUCTION_STATUS.CANCELLED;
  const currentIndex =
    currentStatus === PRODUCTION_STATUS.COMPLETED
      ? ORDERED_STEPS.length
      : isCancelled
        ? -1
        : ORDERED_STEPS.indexOf(currentStatus as TrackerStageKey);

  return ORDERED_STEPS.map((step, idx) => {
    let state: TrackerStageState = 'upcoming';
    if (isCancelled) {
      state = idx === 0 ? 'cancelled' : 'upcoming';
    } else if (currentIndex > idx) {
      state = step === PRODUCTION_STATUS.AWAITING_SETTLEMENT ? 'skipped' : 'completed';
    } else if (currentIndex === idx) {
      state = 'current';
    }

    return {
      step: idx + 1,
      key: step,
      label: getProductionStatusLabel(step, fulfillmentType),
      state,
    };
  });
}

function getStageIndicatorClass(state: TrackerStageState): string {
  switch (state) {
    case 'completed':
      return 'border-ink bg-ink text-white';
    case 'current':
      return 'border-ink bg-surface text-ink ring-2 ring-ink/15';
    case 'skipped':
      return 'border-dashed border-line-strong bg-surface text-muted';
    case 'cancelled':
      return 'border-status-err bg-red-50 text-status-err';
    case 'upcoming':
    default:
      return 'border-line bg-white text-muted';
  }
}

function getStageSymbol(stage: TrackerProductionStageDto): string {
  if (stage.state === 'completed') return '✓';
  if (stage.state === 'skipped') return '—';
  if (stage.state === 'cancelled') return '✕';
  return String(stage.step);
}

interface StepperProps {
  currentStatus: ProductionStatus;
  fulfillmentType?: FulfillmentType;
  stages?: readonly TrackerProductionStageDto[];
  className?: string;
}

export function ProductionStepper({
  currentStatus,
  fulfillmentType = FULFILLMENT_TYPE.SHIP,
  stages,
  className = '',
}: StepperProps) {
  const resolvedStages =
    stages && stages.length > 0 ? stages : buildFallbackStages(currentStatus, fulfillmentType);

  return (
    <div className={`w-full space-y-4 ${className}`}>
      <ol
        className="grid w-full grid-cols-1 gap-3 md:grid-cols-5 md:gap-4"
        aria-label="Progres 5 tahap produksi"
      >
        {resolvedStages.map((stage, idx) => {
          const isCompleted = stage.state === 'completed';
          const isCurrent = stage.state === 'current';
          const isSkipped = stage.state === 'skipped';
          const isCancelled = stage.state === 'cancelled';

          return (
            <li
              key={stage.key}
              className={`relative flex items-start gap-3 rounded-2xl border p-3.5 md:flex-col md:gap-2.5 ${
                isCurrent
                  ? 'border-ink bg-surface'
                  : isCancelled
                    ? 'border-red-200 bg-red-50/40'
                    : 'border-line bg-white'
              }`}
            >
              <div className="flex shrink-0 items-center gap-2 md:w-full">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums ${getStageIndicatorClass(stage.state)}`}
                  aria-hidden="true"
                >
                  {getStageSymbol(stage)}
                </span>
                {idx < resolvedStages.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={`hidden h-px flex-1 md:block ${isCompleted ? 'bg-ink' : 'bg-line'}`}
                  />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="tabular-price text-[11px] font-medium text-muted">
                  Tahap {stage.step}
                </p>
                <p
                  className={`mt-0.5 font-display text-xs font-semibold leading-snug sm:text-sm ${
                    isCancelled
                      ? 'text-status-err'
                      : isCompleted || isCurrent
                        ? 'text-ink'
                        : 'text-muted'
                  }`}
                >
                  {stage.label}
                </p>

                {isCurrent ? (
                  <p className="mt-1 text-[11px] font-semibold text-status-warn">
                    ● Tahap saat ini
                  </p>
                ) : null}
                {isSkipped ? (
                  <p className="mt-1 text-[11px] text-muted">Dilewati (tanpa sisa tagihan)</p>
                ) : null}
                {isCancelled ? (
                  <p className="mt-1 text-[11px] font-semibold text-status-err">
                    Dibatalkan pada tahap ini
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {currentStatus === PRODUCTION_STATUS.COMPLETED ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-status-ok">
          <span aria-hidden="true">✓</span>
          <span>Pesanan telah selesai seluruh tahap produksi dan diterima.</span>
        </div>
      ) : null}
    </div>
  );
}
