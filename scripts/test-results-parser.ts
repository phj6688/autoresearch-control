import { parseResultsTsv } from "../src/lib/results-parser";

const sample = `run_number\ttag\tdescription\tval_bpb\tpeak_vram_mb
0\tbaseline\tbaseline (no changes)\t0.997900\t45060.2
1\tmuon_lr_sweep\tlower muon lr from 0.05 to 0.03\t0.993200\t44820.1
2\tbad_row
3\tarch_change\twider FFN\t0.991500\t44900.0`;

const results = parseResultsTsv(sample);

if (results.length !== 3) {
  process.exit(1);
}

if (results[0].run_number !== 0 || results[0].val_bpb !== 0.9979) {
  process.exit(1);
}

if (results[1].run_number !== 1 || results[1].peak_vram_mb !== 44820.1) {
  process.exit(1);
}

if (results[2].run_number !== 3 || results[2].val_bpb !== 0.9915) {
  process.exit(1);
}

process.exit(0);
