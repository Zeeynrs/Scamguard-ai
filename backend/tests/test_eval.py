"""
Tests for the evaluation harness itself to guarantee repeatability.
"""
from app.intent.eval import BENCHMARK, evaluate, Metrics


def test_benchmark_has_balanced_classes():
    positives = [s for s in BENCHMARK if s.is_scam]
    negatives = [s for s in BENCHMARK if not s.is_scam]
    assert len(positives) == len(negatives) == 10


def test_benchmark_has_equal_languages():
    id_samples = [s for s in BENCHMARK if s.language == "id"]
    en_samples = [s for s in BENCHMARK if s.language == "en"]
    assert len(id_samples) == len(en_samples) == 10


def test_evaluator_produces_realistic_metrics():
    metrics = evaluate()
    assert "all" in metrics
    assert "id" in metrics
    assert "en" in metrics

    all_m = metrics["all"]
    # We insist on honest calibrated numbers, but guarantee baseline performance:
    # Precision and recall must each be at least 70% to prevent regressions.
    assert all_m.precision >= 0.70
    assert all_m.recall >= 0.70
    assert all_m.f1 >= 0.70
