import { useQueryClient } from '@tanstack/react-query';
import {
  COLLECTION_STATUS,
  type CatalogCategoryDto,
  type CatalogCollectionDto,
  type FabricDto,
  type GarmentModelDto,
} from '@yng/shared';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  GripVertical,
  Layers,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Power,
  Wand2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ActiveStatusBadge } from '../../../components/admin/AdminFeedbackBanner';
import CatalogImageField from '../../../components/admin/CatalogImageField';
import { Badge } from '../../../components/ui/Badge';
import { IconTooltip } from '../../../components/ui/IconTooltip';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/toastContext';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import {
  createModel,
  deactivateModel,
  listCategories,
  listCollections,
  listFabrics,
  listModels,
  replaceModelFabrics,
  updateModel,
} from '../../../services/adminMasterService';
import { catalogQueryKeys } from '../../../services/catalogService';
import { extractApiError } from '../../../utils/apiError';
import { formatRupiah } from '../../../utils/formatRupiah';

interface ModelsTabProps {
  includeInactive: boolean;
  onChangeIncludeInactive?: (next: boolean) => void;
}

type ViewMode = 'grid' | 'table';

interface ModelFormState {
  name: string;
  slug: string;
  categoryId: string;
  collectionId: string;
  basePrice: string;
  mockupTemplate: string;
  description: string;
  imagePath: string | null;
  imageUrl: string | null;
}

interface DragSession {
  pointerId: number;
  draggedId: number;
  startPointerX: number;
  startPointerY: number;
  startOffsetLeft: number;
  startOffsetTop: number;
  startScrollX: number;
  startScrollY: number;
  lastClientX: number;
  lastClientY: number;
  initialModels: GarmentModelDto[];
}

interface CardPosition {
  left: number;
  top: number;
}

const INITIAL_FORM: ModelFormState = {
  name: '',
  slug: '',
  categoryId: '',
  collectionId: '',
  basePrice: '0',
  mockupTemplate: '',
  description: '',
  imagePath: null,
  imageUrl: null,
};

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s/_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const num = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(num) ? num : null;
}

function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved !== undefined) {
    next.splice(toIndex, 0, moved);
  }
  return next;
}

function computeSequentialUpdates(
  nextModels: readonly GarmentModelDto[],
  previousModels: readonly GarmentModelDto[]
): {
  normalizedModels: GarmentModelDto[];
  changedItems: Array<{ id: number; sortOrder: number }>;
} {
  const previousSortById = new Map<number, number>();
  for (const item of previousModels) {
    previousSortById.set(item.id, item.sortOrder);
  }

  const normalizedModels = nextModels.map((item, idx) => ({
    ...item,
    sortOrder: idx + 1,
  }));

  const changedItems = normalizedModels
    .filter((item) => previousSortById.get(item.id) !== item.sortOrder)
    .map((item) => ({ id: item.id, sortOrder: item.sortOrder }));

  return { normalizedModels, changedItems };
}

export default function ModelsTab({ includeInactive, onChangeIncludeInactive }: ModelsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [models, setModels] = useState<GarmentModelDto[]>([]);
  const [allFabrics, setAllFabrics] = useState<FabricDto[]>([]);
  const [categories, setCategories] = useState<CatalogCategoryDto[]>([]);
  const [collections, setCollections] = useState<CatalogCollectionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Toolbar Bank Model state
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [collectionFilter, setCollectionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [reorderMode, setReorderMode] = useState(false);

  // Slide-over Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState<ModelFormState>(INITIAL_FORM);

  // Modal Atur Bahan
  const [linkingModel, setLinkingModel] = useState<GarmentModelDto | null>(null);
  const [selectedFabricIds, setSelectedFabricIds] = useState<number[]>([]);
  const [savingFabrics, setSavingFabrics] = useState(false);

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const modelsRef = useRef<GarmentModelDto[]>([]);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const prevPositionsRef = useRef<Map<number, CardPosition>>(new Map());
  const dragSessionRef = useRef<DragSession | null>(null);

  const closeDrawer = useCallback(() => {
    if (submitting) return;
    setDrawerOpen(false);
  }, [submitting]);

  useBodyScrollLock(drawerOpen);
  useEscapeKey(drawerOpen, closeDrawer);

  useEffect(() => {
    modelsRef.current = models;
  }, [models]);

  const fabricMap = useMemo(() => {
    const map = new Map<number, FabricDto>();
    for (const fabric of allFabrics) {
      map.set(fabric.id, fabric);
    }
    return map;
  }, [allFabrics]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const isFiltering =
    normalizedSearch.length > 0 || categoryFilter !== 'ALL' || collectionFilter !== 'ALL';

  const visibleModels = useMemo(() => {
    return models.filter((model) => {
      if (categoryFilter === 'UNCATEGORIZED') {
        if (model.categoryId !== null) return false;
      } else if (categoryFilter !== 'ALL' && model.categoryId !== categoryFilter) {
        return false;
      }

      if (collectionFilter !== 'ALL' && model.collectionId !== collectionFilter) {
        return false;
      }

      if (normalizedSearch) {
        const hay = `${model.name} ${model.slug}`.toLowerCase();
        if (!hay.includes(normalizedSearch)) return false;
      }

      return true;
    });
  }, [models, categoryFilter, collectionFilter, normalizedSearch]);

  const globalIndexById = useMemo(() => {
    const map = new Map<number, number>();
    models.forEach((model, index) => {
      map.set(model.id, index);
    });
    return map;
  }, [models]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsData, fabricsData, categoriesData, collectionsData] = await Promise.all([
        listModels(includeInactive),
        listFabrics(true),
        listCategories(true),
        listCollections(true),
      ]);
      modelsRef.current = modelsData;
      setModels(modelsData);
      setAllFabrics(fabricsData);
      setCategories(categoriesData);
      setCollections(collectionsData);
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memuat bank model pakaian.');
      toast(parsed.message, 'err', { details: parsed.details });
    } finally {
      setLoading(false);
    }
  }, [includeInactive, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const invalidatePublicCatalog = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: catalogQueryKeys.models }),
      queryClient.invalidateQueries({ queryKey: catalogQueryKeys.categories }),
      queryClient.invalidateQueries({ queryKey: catalogQueryKeys.collections }),
    ]);
  }, [queryClient]);

  const captureCardPositions = useCallback(() => {
    const snapshot = new Map<number, CardPosition>();
    for (const model of modelsRef.current) {
      const el = cardRefs.current.get(model.id);
      if (el) {
        snapshot.set(model.id, { left: el.offsetLeft, top: el.offsetTop });
      }
    }
    prevPositionsRef.current = snapshot;
  }, []);

  const persistReorderedModels = useCallback(
    async (nextModels: GarmentModelDto[], previousModels: GarmentModelDto[]) => {
      const { normalizedModels, changedItems } = computeSequentialUpdates(
        nextModels,
        previousModels
      );

      if (changedItems.length === 0) {
        return;
      }

      modelsRef.current = normalizedModels;
      setModels(normalizedModels);
      setReordering(true);

      try {
        const updatedList = await Promise.all(
          changedItems.map((item) => updateModel(item.id, { sortOrder: item.sortOrder }))
        );
        const updatedById = new Map(updatedList.map((item) => [item.id, item]));
        const syncedModels = normalizedModels.map((item) => updatedById.get(item.id) ?? item);

        modelsRef.current = syncedModels;
        setModels(syncedModels);
        await queryClient.invalidateQueries({ queryKey: catalogQueryKeys.models });
        toast(`Urutan tampilan diperbarui (${changedItems.length} model disimpan).`, 'ok');
      } catch (err: unknown) {
        const parsed = extractApiError(err, 'Gagal menyimpan urutan model pakaian.');
        toast(parsed.message, 'err', { details: parsed.details });
        await loadData();
      } finally {
        setReordering(false);
      }
    },
    [loadData, queryClient, toast]
  );

  const orderKey = models.map((model) => model.id).join(',');

  useLayoutEffect(() => {
    const prevPositions = prevPositionsRef.current;
    if (prevPositions.size === 0) {
      return;
    }
    prevPositionsRef.current = new Map();

    const session = dragSessionRef.current;
    if (session) {
      const draggedEl = cardRefs.current.get(session.draggedId);
      if (draggedEl) {
        const travelX =
          session.lastClientX - session.startPointerX + (window.scrollX - session.startScrollX);
        const travelY =
          session.lastClientY - session.startPointerY + (window.scrollY - session.startScrollY);
        const visualLeft = session.startOffsetLeft + travelX;
        const visualTop = session.startOffsetTop + travelY;
        setDragOffset({
          x: visualLeft - draggedEl.offsetLeft,
          y: visualTop - draggedEl.offsetTop,
        });
      }
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      return;
    }

    const cleanupTimers: number[] = [];

    for (const model of modelsRef.current) {
      if (session && model.id === session.draggedId) {
        continue;
      }
      const el = cardRefs.current.get(model.id);
      const oldPos = prevPositions.get(model.id);
      if (!el || !oldPos) {
        continue;
      }

      const deltaX = oldPos.left - el.offsetLeft;
      const deltaY = oldPos.top - el.offsetTop;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        continue;
      }

      el.style.transition = 'none';
      el.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
      void el.offsetHeight;

      window.requestAnimationFrame(() => {
        el.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = '';
      });

      const timer = window.setTimeout(() => {
        el.style.transition = '';
        el.style.transform = '';
      }, 240);
      cleanupTimers.push(timer);
    }

    return () => {
      for (const timer of cleanupTimers) {
        window.clearTimeout(timer);
      }
    };
  }, [orderKey]);

  useEffect(() => {
    if (draggingId === null) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      session.lastClientX = event.clientX;
      session.lastClientY = event.clientY;

      const draggedEl = cardRefs.current.get(session.draggedId);
      if (!draggedEl) {
        return;
      }

      const travelX =
        event.clientX - session.startPointerX + (window.scrollX - session.startScrollX);
      const travelY =
        event.clientY - session.startPointerY + (window.scrollY - session.startScrollY);
      const visualLeft = session.startOffsetLeft + travelX;
      const visualTop = session.startOffsetTop + travelY;

      setDragOffset({
        x: visualLeft - draggedEl.offsetLeft,
        y: visualTop - draggedEl.offsetTop,
      });

      const currentList = modelsRef.current;
      const currentIndex = currentList.findIndex((item) => item.id === session.draggedId);
      if (currentIndex < 0) {
        return;
      }

      const draggedCenterX = visualLeft + draggedEl.offsetWidth / 2;
      const draggedCenterY = visualTop + draggedEl.offsetHeight / 2;

      let targetIndex = -1;
      for (let i = 0; i < currentList.length; i += 1) {
        const candidate = currentList[i];
        if (!candidate || candidate.id === session.draggedId) {
          continue;
        }
        const el = cardRefs.current.get(candidate.id);
        if (!el) {
          continue;
        }
        const padX = Math.min(24, el.offsetWidth * 0.12);
        const padY = Math.min(24, el.offsetHeight * 0.12);
        const withinX =
          draggedCenterX >= el.offsetLeft + padX &&
          draggedCenterX <= el.offsetLeft + el.offsetWidth - padX;
        const withinY =
          draggedCenterY >= el.offsetTop + padY &&
          draggedCenterY <= el.offsetTop + el.offsetHeight - padY;

        if (withinX && withinY) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex !== -1 && targetIndex !== currentIndex) {
        captureCardPositions();
        const swapped = moveItem(currentList, currentIndex, targetIndex);
        modelsRef.current = swapped;
        setModels(swapped);
      }
    }

    function finishDrag(event: PointerEvent, cancelled: boolean) {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      dragSessionRef.current = null;
      setDraggingId(null);
      setDragOffset({ x: 0, y: 0 });

      if (cancelled) {
        modelsRef.current = session.initialModels;
        setModels(session.initialModels);
        return;
      }

      const finalModels = modelsRef.current;
      const hasOrderChanged = finalModels.some(
        (item, idx) => session.initialModels[idx]?.id !== item.id
      );

      if (hasOrderChanged) {
        void persistReorderedModels(finalModels, session.initialModels);
      }
    }

    function handlePointerUp(event: PointerEvent) {
      finishDrag(event, false);
    }

    function handlePointerCancel(event: PointerEvent) {
      finishDrag(event, true);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [draggingId, captureCardPositions, persistReorderedModels]);

  function handleDragHandlePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    model: GarmentModelDto
  ) {
    if (
      !reorderMode ||
      reordering ||
      loading ||
      submitting ||
      isFiltering ||
      modelsRef.current.length < 2
    ) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    const cardEl = cardRefs.current.get(model.id);
    if (!cardEl) {
      return;
    }

    event.preventDefault();

    dragSessionRef.current = {
      pointerId: event.pointerId,
      draggedId: model.id,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startOffsetLeft: cardEl.offsetLeft,
      startOffsetTop: cardEl.offsetTop,
      startScrollX: window.scrollX,
      startScrollY: window.scrollY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      initialModels: modelsRef.current,
    };

    setDraggingId(model.id);
    setDragOffset({ x: 0, y: 0 });
  }

  function handleStepMove(index: number, delta: -1 | 1) {
    if (!reorderMode || reordering || loading || isFiltering || draggingId !== null) {
      return;
    }
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= models.length) {
      return;
    }

    captureCardPositions();
    const nextModels = moveItem(models, index, targetIndex);
    void persistReorderedModels(nextModels, models);
  }

  function handleHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      handleStepMove(index, -1);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      handleStepMove(index, 1);
    }
  }

  function openCreateDrawer() {
    setEditingId(null);
    setSlugTouched(false);
    setForm({
      ...INITIAL_FORM,
      categoryId:
        categoryFilter !== 'ALL' && categoryFilter !== 'UNCATEGORIZED' ? categoryFilter : '',
      collectionId: collectionFilter !== 'ALL' ? collectionFilter : '',
    });
    setDrawerOpen(true);
  }

  function startEdit(model: GarmentModelDto) {
    setEditingId(model.id);
    setSlugTouched(true);
    setForm({
      name: model.name,
      slug: model.slug,
      categoryId: model.categoryId ?? '',
      collectionId: model.collectionId ?? '',
      basePrice: String(model.basePrice),
      mockupTemplate: model.mockupTemplate ?? '',
      description: model.description ?? '',
      imagePath: model.imagePath,
      imageUrl: model.imageUrl,
    });
    setDrawerOpen(true);
  }

  function openLinkFabrics(model: GarmentModelDto) {
    setLinkingModel(model);
    setSelectedFabricIds(model.fabricIds);
  }

  function toggleFabricSelection(fabricId: number) {
    setSelectedFabricIds((prev) =>
      prev.includes(fabricId) ? prev.filter((id) => id !== fabricId) : [...prev, fabricId]
    );
  }

  async function handleSaveFabrics() {
    if (!linkingModel) return;
    setSavingFabrics(true);
    try {
      const updated = await replaceModelFabrics(linkingModel.id, { fabricIds: selectedFabricIds });
      setModels((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      await invalidatePublicCatalog();
      setLinkingModel(null);
      toast(`Relasi bahan untuk model "${updated.name}" berhasil disimpan.`, 'ok');
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memperbarui relasi bahan model.');
      toast(parsed.message, 'err', { details: parsed.details });
    } finally {
      setSavingFabrics(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = form.name.trim();
    const slug = form.slug.trim();
    const basePrice = parseNonNegativeInt(form.basePrice);

    if (name.length < 2) {
      toast('Nama model minimal 2 karakter.', 'err');
      return;
    }

    if (slug.length < 2 || slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      toast(
        'Slug minimal 2 karakter dan hanya boleh huruf kecil, angka, serta tanda hubung (-).',
        'err'
      );
      return;
    }

    if (basePrice === null) {
      toast('Harga dasar harus berupa bilangan bulat rupiah.', 'err');
      return;
    }

    setSubmitting(true);
    try {
      const basePayload = {
        name,
        slug,
        basePrice,
        categoryId: form.categoryId || null,
        collectionId: form.collectionId || null,
        mockupTemplate: form.mockupTemplate.trim() || null,
        description: form.description.trim() || null,
        imagePath: form.imagePath,
      };

      if (editingId !== null) {
        const updated = await updateModel(editingId, basePayload);
        toast(`Model "${updated.name}" berhasil diperbarui.`, 'ok');
      } else {
        const nextSortOrder =
          Math.max(
            models.length,
            models.reduce((max, item) => Math.max(max, item.sortOrder), 0)
          ) + 1;

        const created = await createModel({
          ...basePayload,
          sortOrder: nextSortOrder,
        });
        toast(`Model "${created.name}" berhasil ditambahkan ke Bank Model.`, 'ok');
      }

      setDrawerOpen(false);
      setEditingId(null);
      setSlugTouched(false);
      setForm(INITIAL_FORM);
      await loadData();
      await invalidatePublicCatalog();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan data model.');
      toast(parsed.message, 'err', { details: parsed.details });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(model: GarmentModelDto) {
    setBusyId(model.id);
    try {
      if (model.isActive) {
        await deactivateModel(model.id);
        await loadData();
        await invalidatePublicCatalog();
        toast(`Model "${model.name}" dinonaktifkan.`, 'ok', {
          duration: 6000,
          action: {
            label: 'Urungkan',
            onClick: async () => {
              try {
                await updateModel(model.id, { isActive: true });
                await loadData();
                await invalidatePublicCatalog();
                toast(`Model "${model.name}" diaktifkan kembali.`, 'ok');
              } catch (undoErr: unknown) {
                const parsedUndo = extractApiError(undoErr, 'Gagal mengaktifkan kembali model.');
                toast(parsedUndo.message, 'err', { details: parsedUndo.details });
              }
            },
          },
        });
      } else {
        await updateModel(model.id, { isActive: true });
        await loadData();
        await invalidatePublicCatalog();
        toast(`Model "${model.name}" diaktifkan kembali.`, 'ok');
      }
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal mengubah status model.');
      toast(parsed.message, 'err', { details: parsed.details });
    } finally {
      setBusyId(null);
    }
  }

  function resetAllFilters() {
    setCategoryFilter('ALL');
    setCollectionFilter('ALL');
    setSearchQuery('');
  }

  return (
    <div className="space-y-5">
      {/* Toolbar Bank Model */}
      <section className="card-sharp space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="tablist"
            aria-label="Filter cepat kategori model"
            className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:pb-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={categoryFilter === 'ALL'}
              onClick={() => setCategoryFilter('ALL')}
              className={`inline-flex min-h-[38px] shrink-0 items-center rounded-sm border px-3.5 text-xs font-semibold transition-colors ${
                categoryFilter === 'ALL'
                  ? 'border-ink bg-ink text-white'
                  : 'border-line bg-[#FAFAFA] text-ink hover:border-ink'
              }`}
            >
              Semua ({models.length})
            </button>
            {categories.map((cat) => {
              const count = models.filter((m) => m.categoryId === cat.id).length;
              const isSelected = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-sm border px-3.5 text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-white text-ink hover:border-ink'
                  }`}
                >
                  <span>{cat.name}</span>
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      isSelected ? 'text-neutral-300' : 'text-muted'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
            {models.some((m) => m.categoryId === null) ? (
              <button
                type="button"
                role="tab"
                aria-selected={categoryFilter === 'UNCATEGORIZED'}
                onClick={() => setCategoryFilter('UNCATEGORIZED')}
                className={`inline-flex min-h-[38px] shrink-0 items-center rounded-sm border px-3.5 text-xs font-semibold transition-colors ${
                  categoryFilter === 'UNCATEGORIZED'
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-white text-muted hover:border-ink hover:text-ink'
                }`}
              >
                Tanpa Kategori
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={openCreateDrawer}
            className="btn-primary inline-flex shrink-0 items-center gap-2 px-4 py-2.5 text-xs"
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
            <span>Tambah Model</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 border-t border-line pt-3.5 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Cari nama atau slug model"
              placeholder="Cari nama atau slug model..."
              className="input-sharp min-w-[200px] flex-1 sm:max-w-xs"
            />

            <select
              aria-label="Filter koleksi model"
              value={collectionFilter}
              onChange={(event) => setCollectionFilter(event.target.value)}
              className="input-sharp w-full sm:w-52"
            >
              <option value="ALL">Semua Koleksi / Series</option>
              {collections.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                  {col.status === COLLECTION_STATUS.SOLD_OUT ? ' (Sold Out)' : ''}
                </option>
              ))}
            </select>

            {onChangeIncludeInactive ? (
              <label className="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-sm border border-line bg-[#FAFAFA] px-3.5 text-xs font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(event) => onChangeIncludeInactive(event.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                <span>Tampilkan Nonaktif</span>
              </label>
            ) : null}

            {isFiltering ? (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex min-h-touch items-center rounded-sm border border-line bg-white px-3 text-xs font-semibold text-ink transition-colors hover:border-ink"
              >
                Reset Filter
              </button>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            {reordering ? (
              <span role="status" className="text-xs font-medium text-muted">
                Menyimpan urutan...
              </span>
            ) : null}

            <button
              type="button"
              aria-pressed={reorderMode}
              onClick={() => setReorderMode((prev) => !prev)}
              className={`inline-flex min-h-touch items-center gap-1.5 rounded-sm border px-3.5 text-xs font-semibold transition-colors ${
                reorderMode
                  ? 'border-ink bg-ink text-white'
                  : 'border-line bg-white text-ink hover:border-ink hover:bg-[#FAFAFA]'
              }`}
            >
              <ArrowUpDown size={15} strokeWidth={1.5} aria-hidden="true" />
              <span>{reorderMode ? 'Selesai Urutkan' : 'Atur Urutan'}</span>
            </button>

            <div className="flex items-center rounded-sm border border-line bg-[#FAFAFA] p-0.5">
              <IconTooltip
                label="Tampilan Grid Kartu"
                onClick={() => setViewMode('grid')}
                className={`h-9 w-9 min-h-[36px] ${
                  viewMode === 'grid'
                    ? 'bg-ink text-white'
                    : 'bg-transparent text-muted hover:text-ink'
                }`}
              >
                <LayoutGrid size={16} strokeWidth={1.5} aria-hidden="true" />
              </IconTooltip>
              <IconTooltip
                label="Tampilan Tabel Ringkas"
                onClick={() => setViewMode('table')}
                className={`h-9 w-9 min-h-[36px] ${
                  viewMode === 'table'
                    ? 'bg-ink text-white'
                    : 'bg-transparent text-muted hover:text-ink'
                }`}
              >
                <List size={16} strokeWidth={1.5} aria-hidden="true" />
              </IconTooltip>
            </div>
          </div>
        </div>

        {reorderMode && isFiltering ? (
          <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Kosongkan filter kategori, koleksi, dan pencarian untuk menggeser urutan tampil katalog.
          </p>
        ) : null}
      </section>

      {/* Konten Bank Model */}
      {loading ? (
        <div className="card-sharp p-6 text-center text-sm text-muted">
          Memuat bank model pakaian...
        </div>
      ) : models.length === 0 ? (
        <div className="card-sharp space-y-3 p-8 text-center">
          <p className="text-sm text-muted">Belum ada model pakaian pada katalog.</p>
          <button type="button" onClick={openCreateDrawer} className="btn-primary text-xs">
            + Tambah Model Pertama
          </button>
        </div>
      ) : visibleModels.length === 0 ? (
        <div className="card-sharp space-y-3 p-6 text-center">
          <p className="text-sm text-muted">Tidak ada model yang cocok dengan filter saat ini.</p>
          <button type="button" onClick={resetAllFilters} className="btn-secondary text-xs">
            Tampilkan Semua Model
          </button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="card-sharp overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-[#FAFAFA] text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {reorderMode ? <th className="w-24 px-3 py-3">Urutan</th> : null}
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Koleksi / Series</th>
                  <th className="px-4 py-3 text-right">Harga Dasar</th>
                  <th className="px-4 py-3 text-center">Bahan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visibleModels.map((model, index) => {
                  const globalIndex = globalIndexById.get(model.id) ?? index;
                  const isReorderLocked = reordering || isFiltering || models.length < 2;

                  return (
                    <tr key={model.id} className="hover:bg-[#FAFAFA]">
                      {reorderMode ? (
                        <td className="px-3 py-3 align-middle">
                          <div className="flex items-center gap-1">
                            <span className="tabular-price mr-1 font-mono text-xs text-muted">
                              #{globalIndex + 1}
                            </span>
                            <IconTooltip
                              label="Geser naik"
                              disabled={globalIndex === 0 || isReorderLocked}
                              onClick={() => handleStepMove(globalIndex, -1)}
                              className="h-8 w-8 min-h-[32px] border border-line bg-white hover:border-ink"
                            >
                              <ArrowUp size={13} strokeWidth={1.5} aria-hidden="true" />
                            </IconTooltip>
                            <IconTooltip
                              label="Geser turun"
                              disabled={globalIndex === models.length - 1 || isReorderLocked}
                              onClick={() => handleStepMove(globalIndex, 1)}
                              className="h-8 w-8 min-h-[32px] border border-line bg-white hover:border-ink"
                            >
                              <ArrowDown size={13} strokeWidth={1.5} aria-hidden="true" />
                            </IconTooltip>
                          </div>
                        </td>
                      ) : null}

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-[#FAFAFA]">
                            {model.imageUrl ? (
                              <img
                                src={model.imageUrl}
                                alt={model.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-[9px] text-muted">—</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-display font-semibold text-ink">
                              {model.name}
                            </p>
                            <p className="truncate font-mono text-xs text-muted">{model.slug}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-xs text-ink">
                        {model.category?.name ?? <span className="text-muted">—</span>}
                      </td>

                      <td className="px-4 py-3 text-xs">
                        {model.collection ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-ink">{model.collection.name}</span>
                            {model.collection.status === COLLECTION_STATUS.SOLD_OUT ? (
                              <Badge variant="warn">Sold Out</Badge>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="tabular-price px-4 py-3 text-right font-semibold text-ink">
                        {formatRupiah(model.basePrice)}
                      </td>

                      <td className="tabular-price px-4 py-3 text-center text-xs text-ink">
                        {model.fabricIds.length}
                      </td>

                      <td className="px-4 py-3">
                        <ActiveStatusBadge isActive={model.isActive} />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <IconTooltip
                            label={`Edit ${model.name}`}
                            onClick={() => startEdit(model)}
                            className="h-9 w-9 min-h-[36px] border border-line bg-white hover:border-ink"
                          >
                            <Pencil size={15} strokeWidth={1.5} aria-hidden="true" />
                          </IconTooltip>
                          <IconTooltip
                            label={`Atur Bahan (${model.fabricIds.length})`}
                            onClick={() => openLinkFabrics(model)}
                            className="h-9 w-9 min-h-[36px] border border-line bg-white hover:border-ink"
                          >
                            <Layers size={15} strokeWidth={1.5} aria-hidden="true" />
                          </IconTooltip>
                          <IconTooltip
                            label={
                              model.isActive
                                ? `Nonaktifkan ${model.name}`
                                : `Aktifkan ${model.name}`
                            }
                            disabled={busyId === model.id}
                            onClick={() => void handleToggleActive(model)}
                            className={`h-9 w-9 min-h-[36px] border bg-white ${
                              model.isActive
                                ? 'border-line text-status-err hover:border-status-err hover:bg-red-50'
                                : 'border-line text-status-ok hover:border-status-ok hover:bg-emerald-50'
                            }`}
                          >
                            <Power size={15} strokeWidth={1.5} aria-hidden="true" />
                          </IconTooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div
          className={`relative grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 ${
            draggingId !== null ? 'select-none' : ''
          }`}
        >
          {visibleModels.map((model, index) => {
            const globalIndex = globalIndexById.get(model.id) ?? index;
            const isDragging = draggingId === model.id;
            const isReorderLocked = reordering || isFiltering || models.length < 2;

            return (
              <article
                key={model.id}
                ref={(node) => {
                  if (node) {
                    cardRefs.current.set(model.id, node);
                  } else {
                    cardRefs.current.delete(model.id);
                  }
                }}
                style={
                  isDragging
                    ? {
                        transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) scale(1.01)`,
                      }
                    : undefined
                }
                className={`card-sharp flex flex-col justify-between p-4 transition-shadow duration-150 ${
                  isDragging ? 'relative z-20 border-ink shadow-lg ring-1 ring-ink/15' : ''
                }`}
              >
                {reorderMode ? (
                  <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onPointerDown={(event) => handleDragHandlePointerDown(event, model)}
                        onKeyDown={(event) => handleHandleKeyDown(event, globalIndex)}
                        disabled={isReorderLocked}
                        aria-label={`Seret untuk mengubah urutan ${model.name}`}
                        title={
                          isFiltering
                            ? 'Kosongkan filter untuk menggeser urutan'
                            : 'Tahan & geser atau tekan panah keyboard'
                        }
                        className="inline-flex h-10 w-10 min-h-[40px] touch-none cursor-grab items-center justify-center rounded-sm border border-line bg-[#FAFAFA] text-ink transition-colors hover:border-ink active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <GripVertical size={16} strokeWidth={1.5} aria-hidden="true" />
                      </button>

                      <span className="tabular-price inline-flex items-center rounded-sm border border-line bg-[#FAFAFA] px-3 py-1 text-xs font-semibold text-ink">
                        #{globalIndex + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleStepMove(globalIndex, -1)}
                        disabled={globalIndex === 0 || isReorderLocked || draggingId !== null}
                        aria-label={`Geser ${model.name} ke urutan sebelumnya`}
                        className="inline-flex h-10 w-10 min-h-[40px] items-center justify-center rounded-sm border border-line bg-white text-ink transition-colors hover:border-ink hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ArrowUp size={15} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStepMove(globalIndex, 1)}
                        disabled={
                          globalIndex === models.length - 1 ||
                          isReorderLocked ||
                          draggingId !== null
                        }
                        aria-label={`Geser ${model.name} ke urutan berikutnya`}
                        className="inline-flex h-10 w-10 min-h-[40px] items-center justify-center rounded-sm border border-line bg-white text-ink transition-colors hover:border-ink hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ArrowDown size={15} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="flex gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-[#FAFAFA]">
                      {model.imageUrl ? (
                        <img
                          src={model.imageUrl}
                          alt={model.name}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="px-1 text-center text-xs text-muted">Tanpa foto</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display text-base font-semibold text-ink">
                          {model.name}
                        </h3>
                        <ActiveStatusBadge isActive={model.isActive} />
                      </div>
                      <p className="truncate font-mono text-xs text-muted">{model.slug}</p>
                      <p className="tabular-price text-sm font-semibold text-ink">
                        {formatRupiah(model.basePrice)}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {model.category ? (
                          <span className="rounded-sm border border-line bg-[#FAFAFA] px-2 py-0.5 text-[11px] font-medium text-ink">
                            {model.category.name}
                          </span>
                        ) : null}
                        {model.collection ? (
                          <span className="inline-flex items-center gap-1 rounded-sm border border-line bg-white px-2 py-0.5 text-[11px] text-muted">
                            <span>{model.collection.name}</span>
                            {model.collection.status === COLLECTION_STATUS.SOLD_OUT ? (
                              <span className="font-semibold text-status-warn">· Sold Out</span>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-line pt-3">
                    <p className="text-xs font-medium text-muted">
                      Bahan kompatibel (
                      <span className="tabular-price">{model.fabricIds.length}</span>)
                    </p>
                    {model.fabricIds.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {model.fabricIds.map((fid) => {
                          const f = fabricMap.get(fid);
                          return (
                            <span
                              key={fid}
                              className="rounded-sm border border-line-strong bg-[#FAFAFA] px-2.5 py-0.5 font-mono text-[11px] text-ink"
                            >
                              {f ? f.code : `#${fid}`}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-status-warn">
                        Belum ada bahan terhubung. Klik &ldquo;Atur Bahan&rdquo;.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={() => startEdit(model)}
                    className="btn-secondary flex-1 px-3 py-2 text-xs sm:flex-none"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => openLinkFabrics(model)}
                    className="btn-secondary flex-1 px-3 py-2 text-xs sm:flex-none"
                  >
                    Atur Bahan
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(model)}
                    disabled={busyId === model.id}
                    className={`inline-flex min-h-touch flex-1 items-center justify-center rounded-sm border px-3 py-2 font-display text-xs font-semibold transition-colors disabled:opacity-40 sm:flex-none ${
                      model.isActive
                        ? 'border-status-err text-status-err hover:bg-status-err hover:text-white'
                        : 'border-status-ok text-status-ok hover:bg-status-ok hover:text-white'
                    }`}
                  >
                    {busyId === model.id
                      ? 'Proses...'
                      : model.isActive
                        ? 'Nonaktifkan'
                        : 'Aktifkan'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal Atur Bahan */}
      <Modal
        open={Boolean(linkingModel)}
        onClose={() => {
          if (!savingFabrics) setLinkingModel(null);
        }}
        title={linkingModel ? `Atur Bahan · ${linkingModel.name}` : 'Atur Bahan Model'}
        size="md"
      >
        {allFabrics.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada bahan. Tambahkan bahan pada tab Bahan &amp; Warna terlebih dahulu.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {allFabrics.map((fabric) => {
                const checked = selectedFabricIds.includes(fabric.id);
                return (
                  <label
                    key={fabric.id}
                    className={`flex min-h-touch cursor-pointer items-center justify-between gap-3 rounded-sm border px-3.5 py-2.5 transition-colors ${
                      checked ? 'border-ink bg-white' : 'border-line bg-[#FAFAFA] hover:border-ink'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFabricSelection(fabric.id)}
                        className="h-4 w-4 accent-ink"
                        disabled={savingFabrics}
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {fabric.name}{' '}
                          {!fabric.isActive ? (
                            <span className="text-xs text-muted">(Nonaktif)</span>
                          ) : null}
                        </span>
                        <span className="font-mono text-xs text-muted">{fabric.code}</span>
                      </span>
                    </span>
                    <span className="tabular-price text-xs font-medium">
                      +{formatRupiah(fabric.additionalPrice)}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setLinkingModel(null)}
                disabled={savingFabrics}
                className="btn-secondary px-4 py-2 text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleSaveFabrics()}
                disabled={savingFabrics}
                className="btn-primary px-5 py-2 text-xs"
              >
                {savingFabrics ? 'Menyimpan...' : 'Simpan Relasi Bahan'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Slide-Over Drawer Tambah / Edit Model */}
      <AnimatePresence>
        {drawerOpen ? (
          <div className="fixed inset-0 z-50">
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeDrawer}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            />

            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="model-drawer-title"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 right-0 z-10 flex w-[94vw] max-w-[540px] flex-col border-l border-line bg-white"
            >
              <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5 sm:px-6">
                <div>
                  <h2
                    id="model-drawer-title"
                    className="font-display text-base font-semibold text-ink"
                  >
                    {editingId !== null ? 'Edit Model Pakaian' : 'Tambah Model Pakaian'}
                  </h2>
                  <p className="text-xs text-muted">
                    Harga dasar dalam rupiah penuh tanpa desimal.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeDrawer}
                  disabled={submitting}
                  aria-label="Tutup panel form model"
                  className="inline-flex h-10 w-10 min-h-[40px] items-center justify-center rounded-sm text-ink transition-colors hover:bg-surface disabled:opacity-40"
                >
                  <X size={20} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </header>

              <form
                onSubmit={(event) => void handleSubmit(event)}
                className="flex flex-1 flex-col overflow-hidden"
                noValidate
              >
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
                  <div>
                    <label htmlFor="model-name" className="block text-sm font-medium text-ink">
                      Nama Model
                    </label>
                    <input
                      id="model-name"
                      type="text"
                      value={form.name}
                      onChange={(event) => {
                        const nextName = event.target.value;
                        setForm((prev) => ({
                          ...prev,
                          name: nextName,
                          slug: !slugTouched && editingId === null ? slugify(nextName) : prev.slug,
                        }));
                      }}
                      placeholder="Kaos Lengan Pendek"
                      className="input-sharp mt-1.5"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label htmlFor="model-slug" className="block text-sm font-medium text-ink">
                      Slug Unik
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        id="model-slug"
                        type="text"
                        value={form.slug}
                        onChange={(event) => {
                          setSlugTouched(true);
                          setForm((prev) => ({
                            ...prev,
                            slug: event.target.value.toLowerCase().replace(/\s+/g, '-'),
                          }));
                        }}
                        placeholder="kaos-lengan-pendek"
                        className="input-sharp min-w-0 flex-1 font-mono"
                        disabled={submitting}
                      />
                      <IconTooltip
                        label="Samakan slug dengan nama"
                        disabled={submitting || !form.name.trim()}
                        onClick={() => {
                          setForm((prev) => ({ ...prev, slug: slugify(prev.name) }));
                          if (editingId === null) {
                            setSlugTouched(false);
                          }
                        }}
                        className="h-11 w-11 shrink-0 border border-neutral-300 bg-white hover:border-ink"
                      >
                        <Wand2 size={17} strokeWidth={1.5} aria-hidden="true" />
                      </IconTooltip>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="model-category"
                        className="block text-sm font-medium text-ink"
                      >
                        Kategori
                      </label>
                      <select
                        id="model-category"
                        value={form.categoryId}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, categoryId: event.target.value }))
                        }
                        className="input-sharp mt-1.5"
                        disabled={submitting}
                      >
                        <option value="">Tanpa Kategori</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                            {!cat.isActive ? ' (Nonaktif)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="model-collection"
                        className="block text-sm font-medium text-ink"
                      >
                        Koleksi / Series
                      </label>
                      <select
                        id="model-collection"
                        value={form.collectionId}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, collectionId: event.target.value }))
                        }
                        className="input-sharp mt-1.5"
                        disabled={submitting}
                      >
                        <option value="">Tanpa Koleksi</option>
                        {collections.map((col) => (
                          <option key={col.id} value={col.id}>
                            {col.name}
                            {col.status === COLLECTION_STATUS.SOLD_OUT
                              ? ' (Sold Out)'
                              : col.status === COLLECTION_STATUS.ARCHIVED
                                ? ' (Arsip)'
                                : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="model-price" className="block text-sm font-medium text-ink">
                        Harga Dasar (Rp)
                      </label>
                      <input
                        id="model-price"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={form.basePrice}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, basePrice: event.target.value }))
                        }
                        className="input-sharp tabular-price mt-1.5"
                        disabled={submitting}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="model-template"
                        className="block text-sm font-medium text-ink"
                      >
                        Template Mockup (Opsional)
                      </label>
                      <input
                        id="model-template"
                        type="text"
                        value={form.mockupTemplate}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, mockupTemplate: event.target.value }))
                        }
                        placeholder="tee-short"
                        className="input-sharp mt-1.5 font-mono"
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="model-description"
                      className="block text-sm font-medium text-ink"
                    >
                      Deskripsi (Opsional)
                    </label>
                    <input
                      id="model-description"
                      type="text"
                      value={form.description}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="Keterangan singkat model"
                      className="input-sharp mt-1.5"
                      disabled={submitting}
                    />
                  </div>

                  <CatalogImageField
                    id="model-image-upload"
                    label="Foto Model Pakaian"
                    folder="models"
                    pathValue={form.imagePath}
                    existingUrl={form.imageUrl}
                    onChange={(nextPath, nextUrl) =>
                      setForm((prev) => ({ ...prev, imagePath: nextPath, imageUrl: nextUrl }))
                    }
                    disabled={submitting}
                  />
                </div>

                <footer className="flex shrink-0 items-center justify-end gap-2.5 border-t border-line bg-[#FAFAFA] px-5 py-4 sm:px-6">
                  <button
                    type="button"
                    onClick={closeDrawer}
                    disabled={submitting}
                    className="btn-secondary px-4 py-2 text-xs"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary px-5 py-2 text-xs"
                  >
                    {submitting
                      ? 'Menyimpan...'
                      : editingId !== null
                        ? 'Simpan Perubahan'
                        : 'Tambah Model'}
                  </button>
                </footer>
              </form>
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
