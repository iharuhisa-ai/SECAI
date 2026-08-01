"use client";

import { createContext, useContext } from "react";
import type { Staff } from "@/app/lib/types";

interface MobileCtx {
  staff: Staff[];
  currentStaffId: string;
  currentStaff: Staff | null;
  setCurrentStaffId: (id: string) => void;
  loading: boolean;
}

export const MobileContext = createContext<MobileCtx>({
  staff: [],
  currentStaffId: "",
  currentStaff: null,
  setCurrentStaffId: () => {},
  loading: true,
});

export const useMobile = () => useContext(MobileContext);
