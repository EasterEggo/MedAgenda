"use client";

import { useQuery } from "@tanstack/react-query";
import { meApi } from "@/lib/api/endpoints";

export const ME_QUERY_KEY = ["me"] as const;

/** Current user (GET /me). Errors with ApiError UNAUTHENTICATED when not logged in. */
export function useMe() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: meApi.get, retry: false });
}
