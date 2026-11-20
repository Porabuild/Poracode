import Foundation

enum VoiceWav {
  static let maximumSamples = 16_000 * 300
  static let chunkBytes = 192 * 1_024

  /// AVAudioRecorder may add RIFF metadata chunks. Extract only validated
  /// PCM16 mono data and send the same canonical 44-byte WAV as the PWA.
  static func canonical(_ file: URL) throws -> Data {
    let data = try Data(contentsOf: file, options: .mappedIfSafe)
    guard data.count >= 44, data.count <= maximumSamples * 2 + 65_536,
      data.prefix(4) == Data("RIFF".utf8), data[8..<12] == Data("WAVE".utf8) else { throw VoiceInputFailure.recording }
    func integer(_ offset: Int, _ count: Int) -> Int {
      (0..<count).reduce(0) { $0 | (Int(data[offset + $1]) << ($1 * 8)) }
    }
    var offset = 12, validFormat = false, samples: Data?
    while offset <= data.count - 8 {
      let name = data[offset..<offset + 4], length = integer(offset + 4, 4), start = offset + 8
      guard length <= data.count - start else { throw VoiceInputFailure.recording }
      if name == Data("fmt ".utf8) {
        guard length >= 16, integer(start, 2) == 1, integer(start + 2, 2) == 1,
          integer(start + 4, 4) == 16_000, integer(start + 14, 2) == 16 else { throw VoiceInputFailure.recording }
        validFormat = true
      } else if name == Data("data".utf8) {
        guard samples == nil, length > 0, length % 2 == 0, length <= maximumSamples * 2 else { throw VoiceInputFailure.recording }
        samples = data.subdata(in: start..<start + length)
      }
      offset = start + length + (length % 2)
    }
    guard validFormat, let samples else { throw VoiceInputFailure.recording }
    var result = Data()
    func append(_ number: UInt32, bytes: Int) {
      for i in 0..<bytes { result.append(UInt8(truncatingIfNeeded: number >> (8 * i))) }
    }
    result.append(contentsOf: "RIFF".utf8); append(UInt32(samples.count + 36), bytes: 4)
    result.append(contentsOf: "WAVEfmt ".utf8); append(16, bytes: 4)
    append(1, bytes: 2); append(1, bytes: 2); append(16_000, bytes: 4); append(32_000, bytes: 4)
    append(2, bytes: 2); append(16, bytes: 2)
    result.append(contentsOf: "data".utf8); append(UInt32(samples.count), bytes: 4); result.append(samples)
    return result
  }
}
