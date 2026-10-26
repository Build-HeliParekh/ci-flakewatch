// Every migration, in order. Add new ones as NNNN_<name>.ts and list them here.
import * as m0001 from "./0001_initial.js";

export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [m0001];
