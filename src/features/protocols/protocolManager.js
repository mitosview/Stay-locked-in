export class ProtocolManager {
  configure({ protocol, workoutTime = '17:00' }) {
    if (protocol === 'keto') {
      return { protocol, netCarbLimitG: 30, trackMetric: 'netCarbs' };
    }
    if (protocol === 'intermittent_fasting') {
      return {
        protocol,
        fastingWindow: { start: '20:00', end: '12:00' },
        timerEnabled: true
      };
    }
    if (protocol === 'peri_workout') {
      return {
        protocol,
        workoutTime,
        nutrientTiming: {
          preWorkout: '20-40g carbs + 20-30g protein 60-90 min prior',
          postWorkout: '20-40g protein + carbs based on goal'
        }
      };
    }

    return { protocol: 'standard' };
  }
}
