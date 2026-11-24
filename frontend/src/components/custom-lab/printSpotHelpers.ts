import { PRINT_POSITION, type PrintPosition } from '@yng/shared';

export interface PrintSpotDraft {
  key: string;
  printPosition: PrintPosition;
  printSizeId: number | null;
  needsDesignHelp: boolean;
}

export const ORDERED_PRINT_POSITIONS: readonly PrintPosition[] = [
  PRINT_POSITION.FRONT_CHEST,
  PRINT_POSITION.FRONT_CENTER,
  PRINT_POSITION.BACK_CENTER,
  PRINT_POSITION.BACK_UPPER,
  PRINT_POSITION.LEFT_SLEEVE,
  PRINT_POSITION.RIGHT_SLEEVE,
  PRINT_POSITION.COLLAR,
  PRINT_POSITION.OTHER,
];

export function pickNextAvailablePrintPosition(spots: readonly PrintSpotDraft[]): PrintPosition {
  const used = new Set(
    spots.map((spot) => spot.printPosition).filter((position) => position !== PRINT_POSITION.OTHER)
  );
  const available = ORDERED_PRINT_POSITIONS.find(
    (pos) => pos !== PRINT_POSITION.OTHER && !used.has(pos)
  );
  return available ?? PRINT_POSITION.OTHER;
}
