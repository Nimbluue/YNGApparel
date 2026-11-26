import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicGarmentModelDto } from '@yng/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, ShoppingBag, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useCartStore } from '../../lib/store';
import { cartQueryKeys, deleteCartItem, getCartItems } from '../../services/cartService';
import {
  catalogQueryKeys,
  getCatalogConfig,
  getCatalogModels,
} from '../../services/catalogService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';
import { EditorialButton } from '../ui/EditorialButton';
import { useToast } from '../ui/toastContext';

export interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Floating "Studio Bag" drawer dengan DP Gatekeeper Progress Bar dan metadata spec-sheet per item.
 */
export function CartDrawer({ open, onClose, returnFocusRef }: CartDrawerProps) {
  const { isGuest, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCheckedItems = useCartStore((s) => s.setCheckedItems);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useBodyScrollLock(open);
  useEscapeKey(open, onClose);

  const cartEnabled = !isGuest && !authLoading;

  const cartQuery = useQuery({
    queryKey: cartQueryKeys.items,
    queryFn: getCartItems,
    enabled: cartEnabled,
  });

  const configQuery = useQuery({
    queryKey: catalogQueryKeys.config,
    queryFn: getCatalogConfig,
    enabled: open,
  });

  const modelsQuery = useQuery({
    queryKey: catalogQueryKeys.models,
    queryFn: getCatalogModels,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      if (cartEnabled) {
        void cartQuery.refetch();
      }
      const timer = window.setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 20);
      return () => window.clearTimeout(timer);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      returnFocusRef?.current?.focus();
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya refetch ketika state open atau kesiapan auth berubah
  }, [open, cartEnabled]);

  const deleteMutation = useMutation({
    mutationFn: (cartItemUuid: string) => deleteCartItem(cartItemUuid),
    onSuccess: async (_data, deletedUuid) => {
      const currentChecked = Array.from(useCartStore.getState().checkedItems).filter(
        (uuid) => uuid !== deletedUuid
      );
      setCheckedItems(currentChecked);
      await queryClient.invalidateQueries({ queryKey: cartQueryKeys.items });
      toast(t('cart.removed'), 'ok');
    },
    onError: (err) => {
      toast(extractApiError(err, t('cart.loadError')).message, 'err');
    },
  });

  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  const modelById = useMemo(() => {
    const map = new Map<number, PublicGarmentModelDto>();
    for (const model of models) {
      map.set(model.id, model);
    }
    return map;
  }, [models]);

  const recommendedModels = useMemo(() => models.slice(0, 4), [models]);

  const items = useMemo(() => cartQuery.data?.items ?? [], [cartQuery.data?.items]);
  const summary = cartQuery.data?.summary;
  const availableUuids = useMemo(
    () => items.filter((item) => item.isAvailable).map((item) => item.cartItemUuid),
    [items]
  );

  const dpMinQty = summary?.dpMinQty ?? configQuery.data?.dpMinQty ?? 12;
  const dpPercent = summary?.dpPercent ?? configQuery.data?.dpPercent ?? 70;
  const totalQty = summary?.totalQty ?? 0;
  const missingForDp = Math.max(0, dpMinQty - totalQty);
  const dpProgressPct = Math.min(100, Math.round((totalQty / Math.max(1, dpMinQty)) * 100));

  function handleCheckout() {
    if (availableUuids.length === 0) return;
    setCheckedItems(availableUuids);
    onClose();
    navigate('/checkout');
  }

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50">
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={t('cart.title')}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed inset-y-0 right-0 z-10 flex w-full max-w-[420px] flex-col border-l border-neutral-200 bg-white md:inset-y-3 md:right-3 md:h-[calc(100vh-1.5rem)] md:rounded-sm md:border md:border-neutral-200 md:shadow-2xl"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
              <div className="flex items-center gap-2.5">
                <h2 className="font-display text-xs font-bold uppercase tracking-[0.18em] text-ink">
                  {t('cart.title')}
                </h2>
                <span className="rounded-sm border border-line bg-surface px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink tabular-nums">
                  {t('cart.pcsUpper', { count: totalQty })}
                </span>
                {!isGuest && summary ? (
                  <span className="font-mono text-[11px] text-muted tabular-nums">
                    {t('cart.capacity', { count: summary.totalItems, max: summary.maxItems })}
                  </span>
                ) : null}
              </div>

              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label={t('cart.close')}
                className="inline-flex h-11 w-11 items-center justify-center rounded-sm text-ink transition-colors hover:bg-surface"
              >
                <X size={20} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            {!isGuest ? (
              <div className="shrink-0 border-b border-line bg-surface/60 px-5 py-3">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-medium text-ink">
                    {missingForDp > 0
                      ? t('cart.dpMissing', { missing: missingForDp, percent: dpPercent })
                      : t('cart.dpUnlocked', { percent: dpPercent })}
                  </span>
                  <span className="shrink-0 font-mono font-semibold text-ink tabular-nums">
                    {totalQty}/{dpMinQty}
                  </span>
                </div>
                <div
                  className="mt-2 h-1 w-full overflow-hidden bg-neutral-200"
                  role="progressbar"
                  aria-label={t('cart.dpTargetLabel', { percent: dpPercent })}
                  aria-valuenow={Math.min(totalQty, dpMinQty)}
                  aria-valuemin={0}
                  aria-valuemax={dpMinQty}
                >
                  <motion.div
                    className="h-full bg-ink"
                    initial={false}
                    animate={{ width: `${dpProgressPct}%` }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {!isGuest && cartQuery.isLoading ? (
                <div className="space-y-4" aria-busy="true">
                  {[0, 1, 2].map((idx) => (
                    <div key={idx} className="flex gap-3 border-b border-line pb-4">
                      <div className="aspect-[3/4] w-20 shrink-0 animate-pulse bg-surface" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-4 w-3/4 animate-pulse rounded-sm bg-surface" />
                        <div className="h-3 w-1/2 animate-pulse rounded-sm bg-surface" />
                        <div className="h-4 w-1/3 animate-pulse rounded-sm bg-surface" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !isGuest && cartQuery.isError ? (
                <div className="space-y-4 py-8 text-center">
                  <p className="text-sm text-status-err">
                    {extractApiError(cartQuery.error, t('cart.loadError')).message}
                  </p>
                  <EditorialButton
                    variant="secondary"
                    size="sm"
                    onClick={() => void cartQuery.refetch()}
                  >
                    {t('cart.retry')}
                  </EditorialButton>
                </div>
              ) : isGuest || items.length === 0 ? (
                <div className="space-y-8">
                  <div className="border-b border-line pb-6 pt-2 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center border border-line bg-surface">
                      <ShoppingBag
                        size={20}
                        strokeWidth={1.5}
                        aria-hidden="true"
                        className="text-ink"
                      />
                    </div>
                    <h3 className="font-display text-base font-semibold text-ink">
                      {t('cart.emptyTitle')}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                      {isGuest ? t('cart.guestBody') : t('cart.emptyBody')}
                    </p>
                    <div className="mt-5 flex flex-col gap-2.5">
                      <EditorialButton to="/custom-lab" fullWidth onClick={onClose}>
                        {t('cart.startCustomLab')}
                      </EditorialButton>
                      {isGuest ? (
                        <EditorialButton
                          to="/login"
                          state={{ from: { pathname: '/keranjang' } }}
                          variant="secondary"
                          fullWidth
                          onClick={onClose}
                        >
                          {t('cart.login')}
                        </EditorialButton>
                      ) : null}
                    </div>
                  </div>

                  {recommendedModels.length > 0 ? (
                    <div>
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                        {t('cart.recommendations')}
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        {recommendedModels.map((model) => (
                          <Link
                            key={model.id}
                            to={`/custom-lab?model=${encodeURIComponent(model.slug)}`}
                            onClick={onClose}
                            className="group block"
                          >
                            <div className="aspect-[3/4] w-full overflow-hidden border border-line bg-surface">
                              {model.imageUrl ? (
                                <img
                                  src={model.imageUrl}
                                  alt={model.name}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center font-display text-xl font-bold uppercase tracking-[0.14em] text-muted">
                                  {model.name.slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <p className="mt-2 truncate text-xs font-medium text-ink group-hover:underline">
                              {model.name}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-muted tabular-nums">
                              {t('search.startingFrom', { price: formatRupiah(model.basePrice) })}
                            </p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {items.map((item) => {
                    const catalogModel = modelById.get(item.modelId);
                    const modelName =
                      item.pricing?.modelName ?? catalogModel?.name ?? `Model #${item.modelId}`;
                    const fabricName = item.pricing?.fabricName ?? '';
                    const colorName = item.pricing?.colorName ?? item.config.colorName ?? '';
                    const colorHex = item.pricing?.colorHex ?? item.config.colorHex ?? '#d4d4d4';
                    const spotsCount = item.config.prints.length;
                    const isDeleting =
                      deleteMutation.isPending && deleteMutation.variables === item.cartItemUuid;

                    return (
                      <li key={item.cartItemUuid} className="flex gap-3.5 py-4 first:pt-0">
                        <Link
                          to={`/custom-lab?edit=${encodeURIComponent(item.cartItemUuid)}`}
                          onClick={onClose}
                          className="aspect-[3/4] w-20 shrink-0 overflow-hidden border border-line bg-surface"
                        >
                          {catalogModel?.imageUrl ? (
                            <img
                              src={catalogModel.imageUrl}
                              alt={modelName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center font-display text-sm font-bold uppercase tracking-[0.12em] text-muted">
                              {modelName.slice(0, 2)}
                            </div>
                          )}
                        </Link>

                        <div className="flex min-w-0 flex-1 flex-col justify-between">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Link
                                to={`/custom-lab?edit=${encodeURIComponent(item.cartItemUuid)}`}
                                onClick={onClose}
                                className="block truncate text-sm font-medium text-ink hover:underline"
                              >
                                {modelName}
                              </Link>

                              {/* Spec-sheet metadata ala studio */}
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted">
                                {colorName ? (
                                  <span className="inline-flex items-center gap-1.5 text-ink">
                                    <span
                                      aria-hidden="true"
                                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-neutral-300"
                                      style={{ backgroundColor: colorHex }}
                                    />
                                    <span className="truncate">{colorName}</span>
                                  </span>
                                ) : null}
                                {fabricName ? <span>· {fabricName}</span> : null}
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted tabular-nums">
                                <span className="rounded-sm border border-line bg-surface px-1.5 py-0.5 text-ink">
                                  {t('cart.pcsUpper', { count: item.itemQty })}
                                </span>
                                <span>
                                  {spotsCount > 0
                                    ? t('cart.spotsCount', { count: spotsCount })
                                    : t('cart.plain')}
                                </span>
                              </div>

                              {!item.isAvailable ? (
                                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-status-err">
                                  {t('cart.unavailable')}
                                </p>
                              ) : null}
                            </div>

                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => deleteMutation.mutate(item.cartItemUuid)}
                              aria-label={t('cart.remove', { name: modelName })}
                              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
                            >
                              {isDeleting ? (
                                <Loader2
                                  size={16}
                                  strokeWidth={1.5}
                                  aria-hidden="true"
                                  className="animate-spin"
                                />
                              ) : (
                                <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                              )}
                            </button>
                          </div>

                          <p className="mt-2 font-mono text-sm font-semibold text-ink tabular-nums">
                            {formatRupiah(item.lineSubtotal)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {!isGuest && items.length > 0 && summary ? (
              <div className="shrink-0 border-t border-line bg-white px-5 py-4">
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span>{t('cart.totalQty')}</span>
                  <span className="font-mono tabular-nums text-ink">
                    {t('cart.pcs', { count: summary.totalQty })}
                  </span>
                </div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-ink">{t('cart.subtotal')}</span>
                  <span className="font-mono text-base font-semibold text-ink tabular-nums">
                    {formatRupiah(summary.subtotalAmount)}
                  </span>
                </div>
                <p className="mb-4 text-[11px] text-muted">
                  {availableUuids.length === 0 ? t('cart.noAvailable') : t('cart.shippingNote')}
                </p>

                <EditorialButton
                  fullWidth
                  disabled={availableUuids.length === 0}
                  onClick={handleCheckout}
                >
                  {t('cart.checkout')}
                </EditorialButton>

                <Link
                  to="/keranjang"
                  onClick={onClose}
                  className="mt-2 inline-flex min-h-touch w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.14em] text-ink underline-offset-4 hover:underline"
                >
                  {t('cart.viewFull')}
                </Link>
              </div>
            ) : null}
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
