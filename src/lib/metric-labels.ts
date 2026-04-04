/**
 * Human-readable labels for metric keys.
 * Raw key is shown in tooltip; label is shown in UI.
 */

const METRIC_LABELS: Record<string, string> = {
  val_bpb: "Validation BPB",
  train_bpb: "Training BPB",
  val_loss: "Validation Loss",
  train_loss: "Training Loss",
  val_ppl: "Validation Perplexity",
  train_ppl: "Training Perplexity",
  f1_pct: "F1 Score",
  accuracy: "Accuracy",
  precision: "Precision",
  recall: "Recall",
  mrr_at_5: "MRR@5",
  mrr_at_10: "MRR@10",
  ndcg_at_5: "NDCG@5",
  ndcg_at_10: "NDCG@10",
  bleu: "BLEU",
  rouge_l: "ROUGE-L",
  cer: "Character Error Rate",
  wer: "Word Error Rate",
  map_at_5: "MAP@5",
  map_at_10: "MAP@10",
  auc_roc: "AUC-ROC",
  r_squared: "R\u00B2",
  mae: "MAE",
  rmse: "RMSE",
  throughput_tps: "Throughput (tok/s)",
  latency_ms: "Latency (ms)",
};

export function getMetricLabel(key: string): string {
  return METRIC_LABELS[key] ?? key;
}

/** Short label for compact displays (session cards, charts) */
export function getMetricLabelShort(key: string): string {
  const SHORT: Record<string, string> = {
    val_bpb: "BPB",
    train_bpb: "Train BPB",
    val_loss: "Val Loss",
    train_loss: "Train Loss",
    val_ppl: "Val PPL",
    train_ppl: "Train PPL",
    f1_pct: "F1",
    accuracy: "Acc",
    mrr_at_5: "MRR@5",
    mrr_at_10: "MRR@10",
    ndcg_at_5: "NDCG@5",
    ndcg_at_10: "NDCG@10",
    bleu: "BLEU",
    rouge_l: "ROUGE-L",
    throughput_tps: "tok/s",
    latency_ms: "Latency",
  };
  return SHORT[key] ?? METRIC_LABELS[key] ?? key;
}
