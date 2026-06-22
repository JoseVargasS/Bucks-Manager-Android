import { memo, useCallback, useRef, useState } from "react";
import { Alert, Animated, FlatList, Modal, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { Tag } from "../../types";
import { UiCopy } from "../../i18n";
import { loadTags, saveTags } from "../../utils/tags";
import { useModalTransition } from "../ui/useModalTransition";
import { Text, TextInput } from "../ui/AppText";

const PRESET_COLORS = ["#FF6B6B", "#FF8E53", "#FFD93D", "#6BCB77", "#4D96FF", "#9B59B6", "#3498DB", "#1ABC9C", "#F39C12", "#E74C3C", "#2ECC71", "#E91E63"];

export function TagEditorModal({ visible, colors, copy, tags, setTags, onClose }: {
  visible: boolean; colors: Palette; copy: UiCopy; tags: Tag[]; setTags: (t: Tag[]) => void; onClose: () => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingColor, setEditingColor] = useState("");
  const persistQueue = useRef(Promise.resolve());
  const saveRevision = useRef(0);
  const transition = useModalTransition(visible, 12, 0.985);

  const commitTags = useCallback((next: Tag[]) => {
    setTags(next);
    const revision = ++saveRevision.current;
    persistQueue.current = persistQueue.current
      .catch(() => undefined)
      .then(() => saveTags(next))
      .catch(() => {
        if (saveRevision.current !== revision) return;
        void loadTags().then(setTags);
        Alert.alert(
          copy.languageCode === "en" ? "Tags" : "Etiquetas",
          copy.languageCode === "en" ? "The changes could not be saved." : "No se pudieron guardar los cambios.",
        );
      });
  }, [copy.languageCode, setTags]);

  const startEdit = useCallback((tag: Tag) => {
    setEditingId(tag.id);
    setEditingLabel(tag.label);
    setEditingColor(tag.color);
  }, []);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const saveEdit = useCallback(() => {
    if (!editingId || !editingLabel.trim()) return;
    commitTags(tags.map((tag) => tag.id === editingId ? { ...tag, label: editingLabel.trim(), color: editingColor } : tag));
    setEditingId(null);
  }, [commitTags, editingColor, editingId, editingLabel, tags]);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    const key = label.toLocaleLowerCase();
    commitTags([...tags.filter((tag) => tag.label.trim().toLocaleLowerCase() !== key), { id: `${Date.now()}`, label, color: newColor }]);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
  };

  const handleDelete = useCallback((id: string) => commitTags(tags.filter((tag) => tag.id !== id)), [commitTags, tags]);

  if (!transition.modalVisible) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.modalOverlay, { backgroundColor: colors.overlay }, transition.containerStyle]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.recordModal, { backgroundColor: colors.card }, transition.panelStyle]}>
          <View style={[styles.recordHeader, { borderColor: colors.border }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name="tag-multiple" size={19} color={colors.primary} /> {copy.tagsTitle || "Etiquetas"}
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.input }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={{ padding: 14, gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder={copy.tagsNewPlaceholder || "Nueva etiqueta"}
                placeholderTextColor={colors.muted}
                style={{ flex: 1, backgroundColor: colors.input, borderRadius: 8, paddingHorizontal: 12, minHeight: 40, color: colors.text, fontWeight: "600" }}
                onSubmitEditing={handleAdd}
              />
              <TouchableOpacity onPress={handleAdd} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <MaterialCommunityIcons name="plus" size={22} color={colors.onPrimary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {PRESET_COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setNewColor(c)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: 2, borderColor: newColor === c ? colors.text : "transparent" }} />
              ))}
            </View>

            {tags.length > 0 && <View style={{ height: 0.5, backgroundColor: colors.border }} />}

            <FlatList
              data={tags}
              keyExtractor={(t) => t.id}
              style={{ maxHeight: 260 }}
              renderItem={({ item }) => (
                <TagRow
                  tag={item}
                  colors={colors}
                  editing={editingId === item.id}
                  editingLabel={editingId === item.id ? editingLabel : undefined}
                  editingColor={editingId === item.id ? editingColor : undefined}
                  onStartEdit={startEdit}
                  onChangeLabel={setEditingLabel}
                  onChangeColor={setEditingColor}
                  onSave={editingId === item.id ? saveEdit : undefined}
                  onCancel={editingId === item.id ? cancelEdit : undefined}
                  onDelete={handleDelete}
                />
              )}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const TagRow = memo(function TagRow({
  tag, colors, editing, editingLabel, editingColor,
  onStartEdit, onChangeLabel, onChangeColor, onSave, onCancel, onDelete,
}: {
  tag: Tag; colors: Palette; editing: boolean; editingLabel?: string; editingColor?: string;
  onStartEdit: (tag: Tag) => void; onChangeLabel: (value: string) => void; onChangeColor: (value: string) => void;
  onSave?: () => void; onCancel?: () => void; onDelete: (id: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: tag.color }} />
      {editing ? (
        <>
          <TextInput
            value={editingLabel}
            onChangeText={onChangeLabel}
            style={{ flex: 1, backgroundColor: colors.input, borderRadius: 6, paddingHorizontal: 8, minHeight: 32, color: colors.text, fontWeight: "600" }}
            onSubmitEditing={onSave}
          />
          <View style={{ flexDirection: "row", gap: 4, flex: 1, flexWrap: "wrap" }}>
            {PRESET_COLORS.map((color) => (
              <TouchableOpacity key={color} onPress={() => onChangeColor(color)} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color, borderWidth: 1.5, borderColor: editingColor === color ? colors.text : "transparent" }} />
            ))}
          </View>
          <TouchableOpacity onPress={onSave}><MaterialCommunityIcons name="check" size={20} color={colors.primary} /></TouchableOpacity>
          <TouchableOpacity onPress={onCancel}><MaterialCommunityIcons name="close" size={20} color={colors.muted} /></TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={{ flex: 1, fontWeight: "600", fontSize: 14, color: colors.text }}>{tag.label}</Text>
          <TouchableOpacity onPress={() => onStartEdit(tag)}><MaterialCommunityIcons name="pencil" size={18} color={colors.muted} /></TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(tag.id)}><MaterialCommunityIcons name="trash-can" size={18} color={colors.red} /></TouchableOpacity>
        </>
      )}
    </View>
  );
});
