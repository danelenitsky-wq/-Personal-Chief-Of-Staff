"use server";

import { revalidatePath } from "next/cache";
import { getServices } from "@/lib/container";
import { requireUser } from "@/lib/auth/session";
import type { UpdateProfileInput } from "@/lib/validation/schemas";
import { run } from "./result";

export async function updateProfileAction(input: UpdateProfileInput) {
  return run(async () => {
    const user = await requireUser();
    const profile = await (await getServices()).profiles.updateProfile(user.id, input);
    revalidatePath("/", "layout");
    return profile;
  });
}
