import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import type { CompressedImage } from "./compressImage";
const upload = vi.hoisted(() => ({ configured: true, run: vi.fn() }));
vi.mock("./uploadPhoto", () => ({ get CLOUDINARY_CONFIGURED() { return upload.configured; }, uploadPhoto: upload.run }));
import { repairProofFailure, uploadRepairProof } from "./repairProof";

const image = { blob: new Blob(["proof"]) } as CompressedImage;
beforeEach(() => { upload.configured = true; upload.run.mockReset(); });

describe("repair proof failure recovery", () => {
  it("ends progress after a failed upload and allows the same photo to be retried", async () => {
    const progress = vi.fn();
    upload.run.mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValueOnce({url:"https://example.test/repair.jpg",placeholder:false});
    await expect(uploadRepairProof(image, progress)).rejects.toThrow("Network unavailable");
    expect(progress).toHaveBeenLastCalledWith(null);
    await expect(uploadRepairProof(image, progress)).resolves.toBe("https://example.test/repair.jpg");
    expect(upload.run).toHaveBeenLastCalledWith(image.blob, progress);
  });
  it("refuses missing storage without uploading a placeholder", async () => {
    upload.configured = false;
    const progress = vi.fn();
    await expect(uploadRepairProof(image, progress)).rejects.toMatchObject({status:503,problem:{detail:expect.stringContaining("Photo storage is not configured")}});
    expect(upload.run).not.toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith(null);
  });
  it("rejects an accidental placeholder even when storage appears configured", async () => {
    upload.run.mockResolvedValue({url:"https://example.test/placeholder.jpg",placeholder:true});
    await expect(uploadRepairProof(image, vi.fn())).rejects.toThrow("hosted photo");
  });
  it("preserves an API refusal and gives ordinary upload/transport errors an actionable message", () => {
    const refusal = new ApiError(409,{detail:"Only the assigned crew member can submit proof."});
    expect(repairProofFailure(refusal)).toBe(refusal);
    expect(repairProofFailure(new TypeError("Failed to fetch")).problem?.detail).toContain("Your photo and note are still here");
  });
});
