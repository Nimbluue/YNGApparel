import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

export interface EditorialCarouselProps {
  children: ReactNode;
  ariaLabel: string;
  prevLabel: string;
  nextLabel: string;
  controlsAlign?: 'inline-end' | 'edges';
}

/**
 * Wrapper carousel horizontal berbasis Embla untuk swipe mobile 360px dan panah tipis desktop.
 */
export function EditorialCarousel({
  children,
  ariaLabel,
  prevLabel,
  nextLabel,
}: EditorialCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    dragFree: true,
    containScroll: 'trimSnaps',
  });

  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const syncScrollState = useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    syncScrollState();
    emblaApi.on('select', syncScrollState);
    emblaApi.on('reInit', syncScrollState);
    return () => {
      emblaApi.off('select', syncScrollState);
      emblaApi.off('reInit', syncScrollState);
    };
  }, [emblaApi, syncScrollState]);

  const showControls = canPrev || canNext;

  return (
    <div className="relative" role="region" aria-roledescription="carousel" aria-label={ariaLabel}>
      <div ref={emblaRef} className="overflow-hidden">
        <div className="-ml-4 flex">{children}</div>
      </div>

      {showControls ? (
        <div className="mt-5 hidden items-center justify-end gap-2 md:flex">
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            disabled={!canPrev}
            aria-label={prevLabel}
            className="inline-flex h-10 w-10 min-h-[40px] items-center justify-center rounded-sm border border-line bg-white text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
          >
            <ChevronLeft size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            disabled={!canNext}
            aria-label={nextLabel}
            className="inline-flex h-10 w-10 min-h-[40px] items-center justify-center rounded-sm border border-line bg-white text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
          >
            <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
