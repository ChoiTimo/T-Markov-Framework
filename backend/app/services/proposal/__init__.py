"""Proposal Generator service — absorbs tmarkov-app logic.

Sprint 2-3: module_selector, pptx_assembler, neuro_optimizer (delivered)
Sprint 2-5: Claude API module recommendation (planned)
"""

from .module_selector import (
    SelectionInput,
    SelectionResult,
    select_modules,
    validate_selection,
)
from .neuro_optimizer import (
    ProposalContext,
    attach_cross_references,
    build_slide_instances,
)
from .pptx_assembler import assemble_pptx

__all__ = [
    "SelectionInput",
    "SelectionResult",
    "select_modules",
    "validate_selection",
    "ProposalContext",
    "build_slide_instances",
    "attach_cross_references",
    "assemble_pptx",
]
