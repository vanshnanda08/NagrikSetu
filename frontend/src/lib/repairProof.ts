import { ApiError } from "./api";
import { CLOUDINARY_CONFIGURED, uploadPhoto } from "./uploadPhoto";
import type { CompressedImage } from "./compressImage";

/** A repair must have hosted evidence; a demo placeholder is never repair proof. */
export async function uploadRepairProof(image: CompressedImage, progress: (fraction: number | null) => void): Promise<string> {
  try {
    if (!CLOUDINARY_CONFIGURED) throw new ApiError(503, {
      detail: "Photo storage is not configured. Contact the administrator. Your photo and note are still here.",
    });
    progress(0);
    const result = await uploadPhoto(image.blob, progress);
    if (result.placeholder) throw new Error("Repair evidence needs a hosted photo.");
    return result.url;
  } finally {
    progress(null);
  }
}

/** Keep server refusals verbatim and make transport/upload failures visible. */
export function repairProofFailure(error: unknown, subject = "The repair proof"): ApiError {
  return error instanceof ApiError ? error : new ApiError(503, {
    detail: `${subject} could not be sent. Check your connection and try again. Your photo and note are still here.`,
  });
}
