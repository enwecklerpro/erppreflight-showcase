# Excerpt from services/analysis-python/src/core/base_engine.py (shortened).
# Every analysis engine derives from BaseEngine. The class makes each engine declare its rule
# inventory and input contract in one place, versions every rule by content digest, reports its
# own health and ships adversarial inputs that the shared contract test runs against all engines.
# The engines themselves (rule logic, knowledge data) are not part of this showcase.

import hashlib
import json
from abc import ABC, abstractmethod
from typing import Any, ClassVar, Dict, List, Optional, Tuple

from src.core.contracts import InputContract, KnowledgeSource, RuleSpec, standard_input_rules
from src.models.enums import ArtifactType, EngineType
from src.models.request import AnalysisRequest
from src.models.response import AnalysisResponse

DEFAULT_TARGET_RELEASES: Tuple[str, ...] = ("S4H_2022", "S4H_2023", "S4HANA_CLOUD_2402", "S4HANA_CLOUD_2408")


class BaseEngine(ABC):
    """Abstract base class that all 19 ERP Preflight engines implement.

    Each engine declares in one place:
    - ``finding_codes``: its complete rule inventory with remediation text;
    - ``input_contract``: accepted formats + Pydantic model for structured input.
    """

    engine_type: EngineType
    name: str
    description: str
    version: str = "1.0.0"
    supported_artifact_types: List[ArtifactType] = [ArtifactType.JSON]
    # Prefix for runner-generated input findings (<prefix>_INSUFFICIENT_INPUT / _PARSE_ERROR / _INVALID_INPUT).
    rule_prefix: str = ""
    # True when the engine can consume binary payloads (request.get_raw_bytes()), e.g. ZIP / XLSX.
    accepts_binary_input: bool = False
    target_releases: Tuple[str, ...] = DEFAULT_TARGET_RELEASES
    finding_codes: ClassVar[Dict[str, RuleSpec]] = {}
    input_contract: ClassVar[Optional[InputContract]] = None
    knowledge_sources: ClassVar[Tuple[KnowledgeSource, ...]] = ()

    @abstractmethod
    async def analyze(self, request: AnalysisRequest) -> AnalysisResponse:
        """Executes deterministic analysis against input request."""
        pass

    def get_rule_prefix(self) -> str:
        return self.rule_prefix or self.engine_type.value

    def get_rule_catalog(self) -> Dict[str, RuleSpec]:
        """Engine-declared finding codes plus the runner-generated input-validation codes."""
        formats = (
            ", ".join(f.value for f in self.input_contract.formats)
            if self.input_contract else ", ".join(t.value for t in self.supported_artifact_types)
        )
        catalog = dict(standard_input_rules(self.get_rule_prefix(), self.name, formats))
        catalog.update(self.finding_codes)
        return catalog

    def rule_version(self, code: str) -> Optional[str]:
        """Version of one declared rule: engine version + digest of its catalog entry.

        Changes whenever the rule's title, default severity, category or remediation text changes, or the
        engine version is bumped, so persisted findings record exactly which rule definition produced them."""
        spec = self.get_rule_catalog().get(code)
        if spec is None:
            return None
        canonical = json.dumps(spec.as_dict(), sort_keys=True, separators=(",", ":"))
        return f"{self.version}#{hashlib.sha256(canonical.encode('utf-8')).hexdigest()[:16]}"

    # ------------------------------------------------------------------ SDK
    def engine_health_checks(self) -> List[Tuple[str, bool, str]]:
        """Engine-specific health checks (override to verify knowledge files etc.)."""
        return []

    def health(self) -> Dict[str, Any]:
        """Operational self-check shown in the admin console."""
        checks: List[Tuple[str, bool, str]] = [
            ("rule_catalog_declared", bool(self.finding_codes), f"{len(self.finding_codes)} finding codes"),
            (
                "remediation_complete",
                all(spec.remediation.strip() for spec in self.get_rule_catalog().values()),
                "every declared code has remediation text",
            ),
            ("input_contract_declared", self.input_contract is not None, "explicit input contract"),
        ]
        try:
            checks.extend(self.engine_health_checks())
        except Exception as exc:  # noqa: BLE001 — a failing check is reported, not raised
            checks.append(("engine_specific_checks", False, type(exc).__name__))
        ok = all(c[1] for c in checks)
        return {
            "engine_type": self.engine_type.value,
            "status": "OPERATIONAL" if ok else "DEGRADED",
            "checks": [{"name": n, "ok": passed, "detail": d} for n, passed, d in checks],
        }

    @staticmethod
    def contract_probes() -> List[Tuple[str, Dict[str, Any]]]:
        """Test-generation hook: adversarial request payloads every engine must reject without a verdict.

        Used by the parametrized contract test for all registered engines."""
        from src.parsers.json_input import MAX_JSON_DEPTH
        from src.parsers.safe_xml import MAX_XML_DEPTH
        import base64

        random_bytes = bytes((i * 131 + 17) % 256 for i in range(512))  # fixed pseudo-random, deterministic
        depth = MAX_JSON_DEPTH + 1
        xml_depth = MAX_XML_DEPTH + 1
        return [
            ("empty", {"raw_content": ""}),
            ("whitespace", {"raw_content": "   \n\t  \r\n"}),
            ("random_bytes_base64", {"raw_content": base64.b64encode(random_bytes).decode(), "raw_content_encoding": "base64"}),
            ("empty_object", {"raw_content": "{}"}),
            ("empty_array", {"raw_content": "[]"}),
            ("malformed_json", {"raw_content": '{"key": [1, 2, {"open": '}),
            ("malformed_xml", {"raw_content": "<root><unclosed attr='x'></root>"}),
            ("json_nesting_bomb", {"raw_content": "[" * depth + "]" * depth}),
            ("json_object_nesting_bomb", {"raw_content": '{"a":' * depth + "1" + "}" * depth}),
            ("xml_nesting_bomb", {"raw_content": "<a>" * xml_depth + "</a>" * xml_depth}),
            ("unrelated_json", {"raw_content": '{"hello": "world", "n": 1}'}),
        ]
