"""Expose packaged skills as virtual files while keeping scratch files in state."""

from pathlib import Path

from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend
from deepagents.backends.protocol import EditResult, FileUploadResponse, WriteResult

SKILLS_SOURCE = "/skills/"
SKILLS_DIRECTORY = Path(__file__).resolve().parents[1] / "skills"


class ReadOnlySkillsBackend(FilesystemBackend):
    """Agent tools may read packaged guidance but cannot overwrite it."""

    def ls_info(self, path: str):
        # deepagents uses POSIX virtual paths; Windows listings retain separators.
        entries = super().ls_info(path)
        for entry in entries:
            entry["path"] = "/" + entry["path"].replace("\\", "/").lstrip("/")
        return entries

    def write(self, file_path: str, content: str) -> WriteResult:
        return WriteResult(error="Packaged skills are read-only.")

    def edit(self, file_path: str, old_string: str, new_string: str,
             replace_all: bool = False) -> EditResult:
        return EditResult(error="Packaged skills are read-only.")

    def upload_files(self, files: list[tuple[str, bytes]]) -> list[FileUploadResponse]:
        return [FileUploadResponse(path=path, error="permission_denied") for path, _ in files]


def create_agent_backend(runtime):
    return CompositeBackend(
        default=StateBackend(runtime),
        routes={SKILLS_SOURCE: ReadOnlySkillsBackend(
            root_dir=SKILLS_DIRECTORY, virtual_mode=True,
        )},
    )
