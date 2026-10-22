const MAX_COMMENT_LENGTH = 1000;
const MAX_NAME_LENGTH = 60;
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SIGNATURE_LENGTH = { "image/jpeg": 3, "image/png": 8, "image/webp": 12 };

function validImageSignature(type, bytes) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte);
  }
  return type === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export function escapeIssueText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_{}\[\]()#+.!|~>-]/g, "\\$&");
}

export async function validateReview(formData) {
  if (!(formData instanceof FormData)) return { ok: false, error: "invalid_form" };

  const category = formData.get("category");
  if (category !== "salon" && category !== "atelier") return { ok: false, error: "invalid_category" };

  const rawRating = formData.get("rating");
  if (typeof rawRating !== "string" || !/^[0-5]$/.test(rawRating)) return { ok: false, error: "invalid_rating" };

  const comment = String(formData.get("comment") ?? "").trim();
  if (!comment || comment.length > MAX_COMMENT_LENGTH) return { ok: false, error: "invalid_comment" };

  const anonymous = ["on", "true", "1"].includes(String(formData.get("anonymous") ?? "").toLowerCase());
  const name = anonymous ? "" : String(formData.get("name") ?? "").trim();
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: "invalid_name" };

  let photo = formData.get("photo");
  if (photo === "" || (typeof File !== "undefined" && photo instanceof File && !photo.name && photo.size === 0)) photo = null;
  if (photo !== null) {
    if (typeof File === "undefined" || !(photo instanceof File) || !PHOTO_TYPES.has(photo.type) || photo.size < SIGNATURE_LENGTH[photo.type] || photo.size > MAX_PHOTO_SIZE) {
      return { ok: false, error: "invalid_photo" };
    }
    const bytes = new Uint8Array(await photo.slice(0, 12).arrayBuffer());
    if (!validImageSignature(photo.type, bytes)) return { ok: false, error: "invalid_photo" };
  }

  return {
    ok: true,
    value: { category, rating: Number(rawRating), name, anonymous, comment, photo },
  };
}
