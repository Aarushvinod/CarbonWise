import dspy

class OptimizeSig(dspy.Signature):
    """Compress a user prompt while preserving intent & constraints."""
    original = dspy.InputField()
    optimized = dspy.OutputField(desc="Short rewrite. No pleasantries. Prefer bullets. Keep code fences. <= target tokens and <= original prompt length.")

class Optimizer(dspy.Module):
    def __init__(self, target_tokens: int = 120):
        super().__init__()
        self.target_tokens = target_tokens
        self.rewriter = dspy.Predict(OptimizeSig)

    def forward(self, original: str) -> dspy.Prediction:
        # The teleprompter will refine/replace this with concise learned instruction + micro-shots
        return self.rewriter(original=original)