export type Pace = "rest" | "normal" | "fast";

export interface BodyState {
  spo2: number;
  fatigue: number;
  sleepDebt: number;
  hydration: number;
  nutrition: number;
}

export interface BodyInputs {
  altitudeM: number;
  oxygenFlowLMin: number;
  pace: Pace;
  loadKg: number;
  sleepHours: number;
  food: number;
  water: number;
  deltaMinutes: number;
}

export interface BodyModelCoefficients {
  baseSpo2: number;
  altitudePenaltyPer1000M: number;
  oxygenBonusPerLMin: number;
  restFatiguePerMinute: number;
  normalFatiguePerMinute: number;
  fastFatiguePerMinute: number;
  restRecoveryPerMinute: number;
  loadFatiguePerKgPerMinute: number;
  sleepDebtFatiguePerHourPerMinute: number;
  dehydrationFatiguePerPointPerMinute: number;
  malnutritionFatiguePerPointPerMinute: number;
  sleepRecoveryPerHour: number;
  hydrationPerWaterUnit: number;
  nutritionPerFoodUnit: number;
}

export const defaultBodyModelCoefficients: BodyModelCoefficients = {
  baseSpo2: 98,
  altitudePenaltyPer1000M: 4.5,
  oxygenBonusPerLMin: 7,
  restFatiguePerMinute: 0.05,
  normalFatiguePerMinute: 0.35,
  fastFatiguePerMinute: 0.9,
  restRecoveryPerMinute: 0.25,
  loadFatiguePerKgPerMinute: 0.01,
  sleepDebtFatiguePerHourPerMinute: 0.01,
  dehydrationFatiguePerPointPerMinute: 0.002,
  malnutritionFatiguePerPointPerMinute: 0.002,
  sleepRecoveryPerHour: 1,
  hydrationPerWaterUnit: 10,
  nutritionPerFoodUnit: 10,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function createBodyState(): BodyState {
  return {
    spo2: 98,
    fatigue: 0,
    sleepDebt: 0,
    hydration: 100,
    nutrition: 100,
  };
}

export function updateBodyState(
  state: BodyState,
  inputs: BodyInputs,
  coefficients: BodyModelCoefficients = defaultBodyModelCoefficients,
): BodyState {
  const minutes = Math.max(0, inputs.deltaMinutes);

  const altitudePenalty =
    (Math.max(0, inputs.altitudeM) / 1000) *
    coefficients.altitudePenaltyPer1000M;
  const oxygenBonus =
    Math.max(0, inputs.oxygenFlowLMin) * coefficients.oxygenBonusPerLMin;
  const spo2 = clamp(
    coefficients.baseSpo2 - altitudePenalty + oxygenBonus,
    0,
    100,
  );

  const paceFatigue =
    inputs.pace === "rest"
      ? coefficients.restFatiguePerMinute
      : inputs.pace === "normal"
        ? coefficients.normalFatiguePerMinute
        : coefficients.fastFatiguePerMinute;
  const loadFatigue =
    Math.max(0, inputs.loadKg) * coefficients.loadFatiguePerKgPerMinute;
  const dehydrationFatigue =
    (100 - clamp(state.hydration, 0, 100)) *
    coefficients.dehydrationFatiguePerPointPerMinute;
  const malnutritionFatigue =
    (100 - clamp(state.nutrition, 0, 100)) *
    coefficients.malnutritionFatiguePerPointPerMinute;
  const sleepFatigue =
    Math.max(0, state.sleepDebt) *
    coefficients.sleepDebtFatiguePerHourPerMinute;
  const restRecovery =
    inputs.pace === "rest" ? coefficients.restRecoveryPerMinute : 0;

  const fatigueDelta =
    (paceFatigue +
      loadFatigue +
      dehydrationFatigue +
      malnutritionFatigue +
      sleepFatigue -
      restRecovery) *
    minutes;

  const sleepDebt = clamp(
    state.sleepDebt - Math.max(0, inputs.sleepHours) * coefficients.sleepRecoveryPerHour,
    0,
    100,
  );
  const hydration = clamp(
    state.hydration + Math.max(0, inputs.water) * coefficients.hydrationPerWaterUnit,
    0,
    100,
  );
  const nutrition = clamp(
    state.nutrition + Math.max(0, inputs.food) * coefficients.nutritionPerFoodUnit,
    0,
    100,
  );

  return {
    spo2,
    fatigue: clamp(state.fatigue + fatigueDelta, 0, 100),
    sleepDebt,
    hydration,
    nutrition,
  };
}
