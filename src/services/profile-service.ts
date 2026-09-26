import type { UserProfile } from "@/types/domain";
import { todayIn } from "@/lib/dates";
import type { Repositories } from "@/lib/db/types";
import { defaultProfile } from "@/lib/db/memory/store";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validation/schemas";
import { validate } from "./errors";
import { systemClock, type Clock } from "./clock";

export function createProfileService(repos: Repositories, clock: Clock = systemClock) {
  async function getProfile(userId: string): Promise<UserProfile> {
    return (await repos.profiles.get(userId)) ?? defaultProfile(userId, clock().toISOString());
  }

  return {
    getProfile,

    async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfile> {
      const data = validate(updateProfileSchema, input);
      if (data.lifeAreas) data.lifeAreas = [...new Set(data.lifeAreas)];
      return repos.profiles.update(userId, {
        ...data,
        phoneNumber: data.phoneNumber === "" ? undefined : data.phoneNumber,
      });
    },

    /** The user's current calendar day in their own timezone. */
    async getToday(userId: string): Promise<{ today: string; profile: UserProfile }> {
      const profile = await getProfile(userId);
      return { today: todayIn(profile.timezone, clock()), profile };
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
