# Retain only minimal context evidence

T3 does not bulk-cache Context Source documents. It stores only citation metadata, source version, and the minimal Context Evidence actually used in Theo's answer, encrypted with the conversation when source policy permits. If retention is forbidden, only locator/version metadata remains and later reproducibility may be limited. All temporary fetch buffers are discarded after the Theo turn. This preserves useful auditability without creating a shadow copy of connected data.
