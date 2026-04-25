/**
 * Standard interfaces for the import application.
 */

export interface RawData {
  headers: string[];
  rows: any[][];
  fileName: string;
}

export interface TargetField {
  id: string;
  name: string;
  required?: boolean;
}

export interface Mapping {
  targetFieldId: string;
  sourceColumnIndex: number | null;
}
