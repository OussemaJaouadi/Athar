"""Actual schema, bounded table previews, and live right-drawer row inspection."""

import json

from rich.console import Group
from rich.padding import Padding
from rich.rule import Rule
from rich.text import Text
from textual import on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import Button, DataTable, Input, Label, Static, Tree

from athar_dataops.schemas.database import TablePage
from athar_dataops.services.database import DatabaseService
from athar_dataops.themes import DARK, LIGHT, themed_json
from athar_dataops.ui.arabic import format_arabic, format_arabic_obj


class DatabasePane(Vertical):
    BINDINGS = [
        Binding("p", "prev_page", "Prev Page", show=False, priority=False),
        Binding("n", "next_page", "Next Page", show=False, priority=False),
        Binding("ctrl+left", "prev_page", "Prev Page", show=False, priority=True),
        Binding("ctrl+right", "next_page", "Next Page", show=False, priority=True),
        Binding("ctrl+p", "prev_page", "Prev Page", show=False, priority=True),
        Binding("ctrl+n", "next_page", "Next Page", show=False, priority=True),
        Binding("pageup", "prev_page", "Prev Page", show=False, priority=False),
        Binding("pagedown", "next_page", "Next Page", show=False, priority=False),
    ]

    def __init__(self, database: DatabaseService, **kwargs):
        super().__init__(**kwargs)
        self._db = database
        self._table: str | None = None
        self._offset = 0
        self._current_page: TablePage | None = None
        self._inspecting = False

    def compose(self) -> ComposeResult:
        with Horizontal(classes="split"):
            with Vertical(classes="rail", id="db-rail"):
                yield Tree("Tables", id="schema-tree")
            with Vertical(classes="detail database-detail", id="db-detail"):
                yield Label("Choose a table", id="results-label", markup=False)
                yield DataTable(
                    id="results-table",
                    cursor_type="row",
                    zebra_stripes=True,
                    cell_padding=0,
                )
                yield Button("Inspect row · Enter", id="inspect-row", disabled=True)
                with Horizontal(classes="pager", id="table-pager"):
                    yield Button("Previous (p)", id="table-prev", disabled=True)
                    yield Button("Next (n)", id="table-next", disabled=True)
            with VerticalScroll(classes="rail", id="db-drawer"):
                yield Button("Back to table · Esc", id="drawer-back")
                yield Label("ROW INSPECTOR", id="drawer-title", classes="heading")
                yield Static("Select a row to inspect fields.", id="drawer-content")

    async def on_mount(self) -> None:
        self._sync_layout()
        await self.refresh_schema()

    def on_resize(self) -> None:
        self._sync_layout()

    def _sync_layout(self) -> None:
        narrow = self.app.size.width < 120
        drawer_focused = any(widget.has_focus for widget in self.query("#db-drawer *"))
        self.set_class(narrow, "narrow")
        self.set_class(narrow and self._inspecting, "inspecting")
        if narrow and not self._inspecting and drawer_focused:
            self.query_one("#results-table", DataTable).focus()

    @on(Button.Pressed, "#inspect-row")
    def inspect_row(self) -> None:
        if not self._current_page or not self._current_page.rows:
            return
        self._inspecting = True
        self._sync_layout()
        if self.app.size.width < 120:
            self.query_one("#drawer-back", Button).focus()
        else:
            self.query_one("#db-drawer", VerticalScroll).focus()

    @on(Button.Pressed, "#drawer-back")
    def back_to_table(self) -> None:
        self._inspecting = False
        self._sync_layout()
        self.query_one("#results-table", DataTable).focus()

    def on_key(self, event) -> None:
        if event.key == "escape" and self.app.size.width < 120 and self._inspecting:
            event.prevent_default()
            event.stop()
            self.back_to_table()

    async def refresh_schema(self) -> None:
        tree = self.query_one("#schema-tree", Tree)
        tree.clear()
        try:
            schema = await self._db.schema()
            for name, columns in schema.items():
                node = tree.root.add(name, data=name)
                for column in columns:
                    node.add_leaf(column)
            tree.root.expand()
            if self._table not in schema:
                self._table = next(iter(schema), None)
            if self._table:
                await self._show_table()
        except Exception as exc:
            self.query_one("#results-label", Label).update(
                f"Could not load schema: {exc}"
            )

    @on(Tree.NodeHighlighted, "#schema-tree")
    async def select_table(self, event: Tree.NodeHighlighted) -> None:
        if event.node.data:
            self._table = event.node.data
            self._offset = 0
            await self._show_table()

    @on(Button.Pressed, "#table-prev")
    @on(Button.Pressed, "#table-next")
    async def change_page(self, event: Button.Pressed) -> None:
        self._offset = max(
            0, self._offset + (100 if event.button.id == "table-next" else -100)
        )
        await self._show_table()

    def action_prev_page(self) -> None:
        if isinstance(self.app.focused, Input):
            return
        btn = self.query_one("#table-prev", Button)
        if not btn.disabled and btn.display:
            btn.press()

    def action_next_page(self) -> None:
        if isinstance(self.app.focused, Input):
            return
        btn = self.query_one("#table-next", Button)
        if not btn.disabled and btn.display:
            btn.press()

    @on(DataTable.RowHighlighted, "#results-table")
    @on(DataTable.RowSelected, "#results-table")
    def on_row_active(
        self, event: DataTable.RowHighlighted | DataTable.RowSelected
    ) -> None:
        if (
            self._table
            and self._current_page
            and 0 <= event.cursor_row < len(self._current_page.rows)
        ):
            self._update_drawer_for_row(self._current_page.rows[event.cursor_row])
            if isinstance(event, DataTable.RowSelected):
                self.inspect_row()

    def _is_dark(self) -> bool:
        try:
            return getattr(self.app, "theme", "athar-dark") != "athar-light"
        except Exception:
            return True

    def on_theme_changed(self) -> None:
        table = self.query_one("#results-table", DataTable)
        if (
            table.cursor_row is not None
            and self._current_page
            and self._current_page.rows
        ):
            if 0 <= table.cursor_row < len(self._current_page.rows):
                self._update_drawer_for_row(self._current_page.rows[table.cursor_row])

    def _update_drawer_for_row(self, row_data) -> None:
        if not self._current_page:
            return
        is_dark = self._is_dark()
        col_color = (DARK if is_dark else LIGHT).primary
        muted = (DARK if is_dark else LIGHT).variables["muted"]
        renderables = []
        for i, (col, val) in enumerate(zip(self._current_page.columns, row_data)):
            is_json = False
            parsed = None
            raw_json_str = None
            if isinstance(val, bytes):
                try:
                    decoded = val.decode("utf-8")
                    parsed = json.loads(decoded)
                    raw_json_str = decoded
                    is_json = True
                except Exception:
                    pass
            elif isinstance(val, str) and (
                (val.startswith("{") and val.endswith("}"))
                or (val.startswith("[") and val.endswith("]"))
            ):
                try:
                    parsed = json.loads(val)
                    raw_json_str = val
                    is_json = True
                except Exception:
                    pass

            header = Text()
            header.append(f"■ {col} ", style=f"bold {col_color}")
            if is_json and raw_json_str is not None:
                count = len(parsed) if isinstance(parsed, (dict, list)) else 1
                unit = "keys" if isinstance(parsed, dict) else "items"
                size_info = f" · {len(val)}B" if isinstance(val, bytes) else ""
                header.append(f"(json · {count} {unit}{size_info})\n", style=muted)
                renderables.append(header)
                value = themed_json(format_arabic_obj(parsed), dark=is_dark)
                if not is_dark:
                    value = Padding(
                        value, (0, 1), style=f"{LIGHT.foreground} on {LIGHT.panel}"
                    )
                renderables.append(value)
            elif val is None:
                header.append("(null)\n", style=muted)
                header.append("NULL\n", style=f"italic {muted}")
                renderables.append(header)
            elif isinstance(val, bytes):
                header.append(f"(bytes · {len(val)}B)\n", style=muted)
                header.append(
                    f"<{len(val)} bytes · hex: {val.hex()[:32]}...>\n", style=col_color
                )
                renderables.append(header)
            else:
                type_name = type(val).__name__
                header.append(f"({type_name})\n", style=muted)
                header.append(f"{format_arabic(str(val))}\n")
                renderables.append(header)

            if i < len(row_data) - 1:
                rule_style = "dim #2B393E" if is_dark else LIGHT.variables["line"]
                renderables.append(Rule(style=rule_style))

        try:
            self.query_one("#drawer-content", Static).update(Group(*renderables))
        except Exception:
            pass

    async def _show_table(self) -> None:
        if self._table is None:
            return
        table = self.query_one("#results-table", DataTable)
        table.clear(columns=True)
        self._current_page = None
        self.query_one("#inspect-row", Button).disabled = True
        self.query_one("#drawer-content", Static).update("Loading row details…")
        self.query_one("#table-next", Button).disabled = True
        try:
            page = await self._db.table_page(self._table, self._offset)
            self._current_page = page
            self.query_one("#inspect-row", Button).disabled = not page.rows

            col_widths = []
            for col_idx, col_name in enumerate(page.columns):
                max_val_len = max(
                    (len(self._preview(row[col_idx])) for row in page.rows),
                    default=0,
                )
                w = max(len(col_name) + 3, max_val_len + 3, 8)
                w = min(w, 24)
                col_widths.append(w)

            for i, (col_name, w) in enumerate(zip(page.columns, col_widths)):
                is_last = i == len(page.columns) - 1
                header_text = (
                    f" {col_name:<{w - 3}} │"
                    if not is_last
                    else f" {col_name:<{w - 1}}"
                )
                table.add_column(header_text, width=w)

            for row in page.rows:
                formatted_cells = []
                for i, (val, w) in enumerate(zip(row, col_widths)):
                    is_last = i == len(row) - 1
                    pv = self._preview(val, max_len=w - 3 if not is_last else w - 1)
                    cell_text = (
                        f" {pv:<{w - 3}} │" if not is_last else f" {pv:<{w - 1}}"
                    )
                    formatted_cells.append(cell_text)
                table.add_row(*formatted_cells)

            table.border_title = f" {self._table} "
            table.border_subtitle = (
                f" rows {self._offset + 1}–{self._offset + len(page.rows)} "
                if page.rows
                else " empty "
            )
            self.query_one("#results-label", Label).update(
                f"{self._table} · "
                + (
                    f"rows {self._offset + 1}–{self._offset + len(page.rows)}"
                    if page.rows
                    else "empty"
                )
            )
            self.query_one("#table-next", Button).disabled = not page.has_more
            self.query_one("#table-pager").display = self._offset > 0 or page.has_more
            if page.rows:
                self._update_drawer_for_row(page.rows[0])
            else:
                self.query_one("#drawer-content", Static).update(
                    "No rows in this table."
                )
        except Exception as exc:
            self.query_one("#results-label", Label).update(
                f"Table preview failed: {exc}"
            )
            self.query_one("#drawer-content", Static).update(
                "Could not load this table."
            )
        self.query_one("#table-prev", Button).disabled = self._offset == 0

    @staticmethod
    def _preview(value, max_len: int = 20) -> str:
        if value is None:
            return "NULL"
        if isinstance(value, bytes):
            return f"<{len(value)}B>"
        text = " ".join(str(value).split())
        text = format_arabic(text)
        if len(text) <= max_len:
            return text
        return text[: max_len - 1] + "…"
