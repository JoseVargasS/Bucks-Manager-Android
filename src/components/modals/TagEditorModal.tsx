import { useState } from "react";
import { FlatList, Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { Tag } from "../../types";
import { UiCopy } from "../../i18n";
import { addTag, updateTag, deleteTag } from "../../utils/tags";

const PRESET_COLORS = ["#FF6B6B", "#FF8E53", "#FFD93D", "#6BCB77", "#4D96FF", "#9B59B6", "#3498DB", "#1ABC9C", "#F39C12", "#E74C3C", "#2ECC71", "#E91E63"];

export function TagEditorModal({ visible, colors, copy, tags, setTags, onClose }: {
  visible: boolean; colors: Palette; copy: UiCopy; tags: Tag[]; setTags: (t: Tag[]) => void; onClose: () => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingColor, setEditingColor] = useState("");

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditingLabel(tag.label);
    setEditingColor(tag.color);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId || !editingLabel.trim()) return;
    const updated = await updateTag({ id: editingId, label: editingLabel.trim(), color: editingColor });
    setTags(updated);
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    const fresh = await addTag({ id: `${Date.now()}`, label: newLabel.trim(), color: newColor });
    setTags(fresh);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
  };

  const handleDelete = async (id: string) => {
    const fresh = await deleteTag(id);
    setTags(fresh);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.recordModal, { backgroundColor: colors.card }]}>
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: item.color }} />
                  {editingId === item.id ? (
                    <>
                      <TextInput
                        value={editingLabel}
                        onChangeText={setEditingLabel}
                        style={{ flex: 1, backgroundColor: colors.input, borderRadius: 6, paddingHorizontal: 8, minHeight: 32, color: colors.text, fontWeight: "600" }}
                        onSubmitEditing={saveEdit}
                      />
                      <View style={{ flexDirection: "row", gap: 4, flex: 1, flexWrap: "wrap" }}>
                        {PRESET_COLORS.map((c) => (
                          <TouchableOpacity key={c} onPress={() => setEditingColor(c)} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c, borderWidth: 1.5, borderColor: editingColor === c ? colors.text : "transparent" }} />
                        ))}
                      </View>
                      <TouchableOpacity onPress={saveEdit}><MaterialCommunityIcons name="check" size={20} color={colors.primary} /></TouchableOpacity>
                      <TouchableOpacity onPress={cancelEdit}><MaterialCommunityIcons name="close" size={20} color={colors.muted} /></TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={{ flex: 1, fontWeight: "600", fontSize: 14, color: colors.text }}>{item.label}</Text>
                      <TouchableOpacity onPress={() => startEdit(item)}><MaterialCommunityIcons name="pencil" size={18} color={colors.muted} /></TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(item.id)}><MaterialCommunityIcons name="trash-can" size={18} color={colors.red} /></TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
