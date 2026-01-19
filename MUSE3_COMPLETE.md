# Muse 3 Implementation Status

## Summary

Muse 3 (S Athena) data streaming has been implemented in muse-js v4.0.0. However, more testing is needed to confirm that data parsing is correct. Also, the demo app data visualization needs to be improved to facilitate validationa nd debugging. PPG support for muse 3 is also not yet implemented.

## What Was Implemented

### 1. Packet Parsers (`src/lib/muse-parse.ts`)
- ✅ **0xDF Packet Parser** - EEG + PPG combined data
  - Decodes 8-channel EEG (TP9, AF7, AF8, TP10, FPz, AUX_R, AUX_L, AUX)
  - Extracts PPG samples from multiplexed data
  - 12-bit EEG samples → microvolts conversion

- ✅ **0xF4 Packet Parser** - IMU (Accelerometer + Gyroscope)
  - 3-axis accelerometer data
  - 3-axis gyroscope data
  - Proper scaling applied (0.01 factor)

- ✅ **0xDB/0xD9 Packet Parsers** - Mixed sensor data
  - Placeholders for future enhancements

### 2. Connection & Initialization (`src/muse.ts`)
- ✅ **Auto-detection** - Automatically detects Muse 3 vs Classic Muse
- ✅ **Proper initialization sequence**:
  1. Send `v6` (version query)
  2. Send `s` (status query)
  3. Send `h` (halt/reset)
  4. Apply preset (e.g., `p1041`)
  5. Send `s` (status after preset)
  6. **Send `dc001` TWICE** (critical!)
  7. Send `L1` (low-latency mode)
  8. Final status query

### 3. Data Streaming
- ✅ **EEG Streaming** - 8 channels at 256 Hz
- ✅ **PPG Streaming** - Multi-channel photoplethysmography
- ✅ **IMU Streaming** - Accelerometer + Gyroscope at 52 Hz
- ✅ **RxJS Observables** - Reactive data streams for all sensors

### 4. Demo Application (`demo/src/`)
- ✅ **Device type display** - Shows "Muse 3" vs "Muse 1/2/S"
- ✅ **8-channel EEG visualization** - Dynamically shows 8 electrodes for Muse 3
- ✅ **Channel name mapping** - Correct labels (TP9, AF7, AF8, TP10, FPz, etc.)
- ✅ **Responsive UI** - Hides extra channels for Classic Muse

## Key Technical Details

### Packet Structure
- **0xDF packets**: `[0xDF][3-byte header][18-byte EEG segments][20-byte PPG segments]`
- **0xF4 packets**: `[0xF4][3-byte header][6 × int16 IMU values]`
- **EEG encoding**: 12-bit samples, 2 samples per 3 bytes
- **IMU encoding**: Big-endian int16 values

### Critical Discovery
The **`dc001` command must be sent TWICE** to start streaming. This is an undocumented requirement discovered by the amused-py project!

### Supported Presets
- `p1041` - Full sensor mode (8 EEG + 16 PPG + IMU) ⭐ Recommended
- `p1042` - Same as p1041
- `p1034` - 8 EEG + 8 PPG + IMU
- `p1035` - 4 EEG + 4 PPG + IMU
- `p1044` - 8 EEG + 8 PPG + IMU (dim LED)
- `p20`, `p21`, `p50`, `p51`, `p60`, `p61` - EEG only variants

## Testing

### Demo Server Running
The demo is currently running at: **http://localhost:4445/**

### To Test with Chrome MCP
1. Open Chrome browser
2. Navigate to http://localhost:4445/
3. Click "Connect!" button
4. Select your Muse 3 device
5. The device type should show "Muse 3 (S Athena)"
6. You should see 8 EEG channels streaming
7. Accelerometer and gyroscope data should display

### Expected Behavior
- Device detection: Automatic (checks for characteristic `273e0013`)
- Initialization: ~2-3 seconds with console logs
- EEG channels: 8 channels labeled correctly
- Data rate: 256 Hz for EEG, 52 Hz for IMU
- PPG: If enabled, heart rate calculation

## Backward Compatibility

✅ **Fully backward compatible** with Classic Muse (1/2/S):
- Classic devices use original 5-characteristic EEG streaming
- Muse 3 uses new 2-characteristic multiplexed streaming
- Auto-detection prevents any breaking changes

## Known Limitations

- **0xDB/0xD9 packets**: Generic parsing only (need more data to fully decode)
- **Battery telemetry**: Not yet implemented for Muse 3
- **fNIRS data**: Parser structure ready but needs packet analysis
- **PPG heart rate**: Simple peak detection (could be enhanced)

## Next Steps

1. ✅ EEG and IMU data streaming implementation complete
2. 🔄 **Test with real Muse 3 device** (current step)
3. ⏸️ Verify backward compatibility with Classic Muse
4. ⏸️ Enhance 0xDB/0xD9 packet parsers
5. ⏸️ Add PPG data streaming for Muse 3
6. ⏸️ Enhance demo app data visualization
7. ⏸️ Add battery telemetry for Muse 3
8. ⏸️ Add comprehensive unit tests

## References

- [amused-py](https://github.com/Amused-EEG/amused-py) - Python implementation reference
- [OpenMuse](https://github.com/DominiqueMakowski/OpenMuse) - Data format documentation
- [MuseAthenaDataformatParser](https://github.com/AbosaSzakal/MuseAthenaDataformatParser) - Packet structure analysis

## Credits

Implementation based on reverse-engineering work by:
- Adrian Tadeusz Belmans (amused-py)
- Dominique Makowski (OpenMuse)
- AbosaSzakal (MuseAthenaDataformatParser)

