---
name: Classic Muse Fixes & Demo Enhancements
about: Fix accelerometer data and enhance demo for all sensor types
title: 'Fix Classic Muse Accelerometer & Enhance Demo'
labels: bug, enhancement, demo
assignees: ''
---

## Bug Report: Accelerometer Data

**Device:** Muse 1/2/S (Classic)
**Status:** EEG works correctly, but accelerometer data appears invalid

### Current Behavior
- EEG streaming works perfectly
- Accelerometer connects but data values appear incorrect
- Telemetry (battery, temperature) works

### Expected Behavior
- Accelerometer should provide valid 3-axis motion data
- Values should be in range ±2G
- Data should respond to device movement

### Debug Steps
1. Log raw accelerometer packets to console
2. Verify parsing in `src/lib/muse-parse.ts:parseAccelerometer()`
3. Check sample array structure and indexing
4. Verify normalization factor (currently 16384 for ±2G range)
5. Compare with Muse SDK expected format

### Code Location
- Parser: `src/lib/muse-parse.ts` - `parseAccelerometer()`
- Demo: `demo/src/main.ts` - line ~52 (uses `accel.samples[2]`)
- Characteristic: `src/muse.ts` - `ACCELEROMETER_CHARACTERISTIC`

## Enhancement: Demo Application

### Current State
Demo only displays:
- ✅ EEG (5 channels)
- ✅ Telemetry (battery, temperature)
- ⚠️ Accelerometer (buggy)
- ❌ Gyroscope (not displayed)
- ❌ PPG (not enabled/displayed)

### Requested Features

#### 1. Add Gyroscope Visualization
- [ ] Add UI section for gyroscope (X, Y, Z rotation rates)
- [ ] Subscribe to `client.gyroscopeData`
- [ ] Display in degrees/second: `(v / 32.768).toFixed(2) + '°/s'`
- [ ] Add visual indicator for rotation

#### 2. Add PPG/Heart Rate Support
- [ ] Add checkbox to enable PPG before connecting
- [ ] Set `client.enablePpg = true` when enabled
- [ ] Display 3 PPG channels (ambient, infrared, red)
- [ ] Subscribe to `client.ppgReadings`
- [ ] Add simple heart rate calculation
- [ ] Show BPM reading

#### 3. Improve Layout & Organization
- [ ] Organize into sections: EEG | Motion | PPG | Telemetry
- [ ] Add enable/disable toggles for sensor types
- [ ] Show connection status per sensor
- [ ] Display data rates (e.g., "256 Hz" for EEG)
- [ ] Add timestamp display

#### 4. Add Data Export
- [ ] Add record/stop button
- [ ] Export to CSV format
- [ ] Export to JSON format
- [ ] Include all active sensors
- [ ] Add timestamps to all samples
- [ ] Allow download of recorded session

### Mockup Layout Suggestion

```
┌─────────────────────────────────────────┐
│  [Connect!]  [●] Recording              │
│  Device: Muse-S | Battery: 85% | 36.5°C │
├─────────────────────────────────────────┤
│  Enable: [✓] EEG [✓] Motion [ ] PPG     │
├─────────────────────────────────────────┤
│  EEG (256 Hz)          Motion (52 Hz)   │
│  ┌───┬───┬───┐         Accel (g)        │
│  │TP9│AF7│AF8│         X: 0.12          │
│  │   │   │   │         Y: -0.98         │
│  └───┴───┴───┘         Z: 0.05          │
│  ┌───┬───┐                              │
│  │TP10│AUX│            Gyro (°/s)       │
│  │   │   │             X: 2.5           │
│  └───┴───┘             Y: -1.2          │
│                        Z: 0.8            │
├─────────────────────────────────────────┤
│  PPG Heart Rate: 72 BPM                 │
│  [ambient] [infrared] [red]             │
└─────────────────────────────────────────┘
```

## Acceptance Criteria

- [ ] Accelerometer data is fixed and displays correctly
- [ ] Gyroscope data is displayed in demo
- [ ] PPG can be enabled and displays correctly
- [ ] Demo layout is organized and clear
- [ ] All sensor types can be tested easily
- [ ] Data export functionality works

## Testing Checklist

- [ ] Test with Muse 1 (EEG only)
- [ ] Test with Muse 2 (EEG + PPG)
- [ ] Test with Muse S classic (EEG + PPG)
- [ ] Verify all data streams are valid
- [ ] Test with physical device movement
- [ ] Verify data export works

See [IMPLEMENTATION_CHECKLIST.md](../../IMPLEMENTATION_CHECKLIST.md) for detailed task breakdown.
