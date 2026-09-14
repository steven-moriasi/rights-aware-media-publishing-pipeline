import { describe, expect, it } from "vitest";

import {
  inspectUpload,
  partsAreContiguous,
  sha256,
} from "./uploads";

function wavFixture(content = "synthetic-audio"): Buffer {
  return Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.alloc(4),
    Buffer.from("WAVE"),
    Buffer.from(content),
  ]);
}

describe("upload inspection", () => {
  it("accepts a bounded WAV fixture with matching checksum", () => {
    const bytes = wavFixture();
    expect(
      inspectUpload({
        actualSha256: sha256(bytes),
        bytes,
        expectedSha256: sha256(bytes),
        expectedSize: bytes.byteLength,
        mediaType: "audio/wav",
      }),
    ).toEqual({ accepted: true, reasonCode: "accepted" });
  });

  it("rejects checksum mismatch before promotion", () => {
    const bytes = wavFixture();
    expect(
      inspectUpload({
        actualSha256: sha256(bytes),
        bytes,
        expectedSha256: "0".repeat(64),
        expectedSize: bytes.byteLength,
        mediaType: "audio/wav",
      }).reasonCode,
    ).toBe("checksum_mismatch");
  });

  it("quarantines the standard deterministic scanner signature", () => {
    const bytes = wavFixture("EICAR-STANDARD-ANTIVIRUS-TEST-FILE");
    expect(
      inspectUpload({
        actualSha256: sha256(bytes),
        bytes,
        expectedSha256: sha256(bytes),
        expectedSize: bytes.byteLength,
        mediaType: "audio/wav",
      }).reasonCode,
    ).toBe("malware_signature");
  });

  it("rejects declared media that does not match its signature", () => {
    const bytes = Buffer.from("not-an-mp4");
    expect(
      inspectUpload({
        actualSha256: sha256(bytes),
        bytes,
        expectedSha256: sha256(bytes),
        expectedSize: bytes.byteLength,
        mediaType: "video/mp4",
      }).reasonCode,
    ).toBe("media_signature_mismatch");
  });
});

describe("multipart ordering", () => {
  it("requires a gapless sequence beginning at one", () => {
    expect(
      partsAreContiguous([
        {
          objectKey: "one",
          partNumber: 1,
          sha256: "a".repeat(64),
          sizeBytes: 1,
        },
        {
          objectKey: "two",
          partNumber: 2,
          sha256: "b".repeat(64),
          sizeBytes: 1,
        },
      ]),
    ).toBe(true);
    expect(
      partsAreContiguous([
        {
          objectKey: "two",
          partNumber: 2,
          sha256: "b".repeat(64),
          sizeBytes: 1,
        },
      ]),
    ).toBe(false);
  });
});
