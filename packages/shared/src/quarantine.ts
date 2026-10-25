// Manual quarantine and the CI quarantine list (REQ-QUA-01, REQ-QUA-05).
import type { QuarantineSource } from "./constants.js";
import type { ManualQuarantine } from "./detail.js";

export interface QuarantineRequest {
  reason: string;
}

export interface QuarantineResponse {
  manualQuarantine: ManualQuarantine;
}

export interface QuarantineListItem {
  id: number;
  file: string;
  classname: string;
  name: string;
  quarantineSource: QuarantineSource | null;
}

export interface QuarantineListResponse {
  repo: string;
  asOf: string;
  items: QuarantineListItem[];
}
