import { EditorView, Decoration } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { EditorState, StateField, RangeSetBuilder, type Transaction } from '@codemirror/state';
import { CsvTableWidget } from './widgets/csv-table';

function buildCsvDecoration(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  
  const hasSelection = state.selection.ranges.some(r => r.from !== r.to);
  const cursorAt = state.selection.main.head;
  const docLen = state.doc.length;

  
  
  if (hasSelection) return builder.finish();

  
  
  if (docLen === 0) return builder.finish();

  const source = state.doc.toString();
  builder.add(
    0,
    docLen,
    Decoration.replace({ widget: new CsvTableWidget(source), block: true }),
  );

  return builder.finish();
}

export const csvTableField = StateField.define<DecorationSet>({
  create(state) { return buildCsvDecoration(state); },
  update(value, tr: Transaction) {
    if (tr.docChanged || tr.selection) {
      return buildCsvDecoration(tr.state);
    }
    return value;
  },
  provide: f => EditorView.decorations.from(f),
});
