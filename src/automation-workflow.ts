import type {PartKey} from './tuning-catalog';

export type AutomationStageId = 'bottom-end' | 'head' | 'intake' | 'exhaust' | 'tuning';

/** Navigation only; options, selection and native confirmation stay with their existing owners. */
export interface AutomationStage {
  readonly id: AutomationStageId;
  readonly name: string;
  readonly shortName: string;
  readonly primaryKeys: readonly [PartKey, PartKey];
  readonly extraKeys: readonly PartKey[];
}

/** Every visible catalog slot belongs to exactly one stage. No tuning values are copied here. */
export const AUTOMATION_STAGES: readonly AutomationStage[] = [
  {
    id: 'bottom-end', name: 'Kurbeltrieb', shortName: 'Kurbeltrieb',
    primaryKeys: ['pistons', 'flywheel'], extraKeys: ['rods'],
  },
  {
    id: 'head', name: 'Kopf & Ventile', shortName: 'Kopf',
    primaryKeys: ['camshaft', 'valveSprings'],
    extraKeys: ['head', 'valves', 'seats', 'retainers', 'lifters'],
  },
  {
    id: 'intake', name: 'Ansaugung', shortName: 'Ansaugung',
    primaryKeys: ['intake', 'throttleBody'], extraKeys: ['filter', 'runners'],
  },
  {
    id: 'exhaust', name: 'Abgas', shortName: 'Abgas',
    primaryKeys: ['exhaust', 'catalyst'], extraKeys: ['exhaustDiameter', 'muffler'],
  },
  {
    id: 'tuning', name: 'Abstimmung', shortName: 'Abstimmung',
    primaryKeys: ['ignition', 'revLimit'], extraKeys: ['mixture', 'camTiming', 'idle'],
  },
];
