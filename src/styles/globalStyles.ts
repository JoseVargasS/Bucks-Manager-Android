/**
 * Barrel re-export — all styles now live in co-located .styles.ts files.
 * This file exists so the 23 existing `import { styles } from "globalStyles"` imports keep working.
 * New code should import from the specific .styles.ts file instead.
 */
import { base } from "./baseStyles";
import { loginStyles } from "../components/screens/LoginScreen.styles";
import { settingsStyles } from "../components/screens/SettingsView.styles";
import { searchModalStyles } from "../components/modals/SearchModal.styles";
import { searchPageStyles } from "../components/screens/SearchPage.styles";
import { detailStyles } from "../components/modals/DetailModal.styles";
import { recordModalStyles } from "../components/modals/TransactionModal.styles";
import { optionSheetStyles } from "../components/modals/OptionSheet.styles";
import { bottomNavStyles } from "../components/layout/BottomNav.styles";
import { expensesStyles } from "../components/screens/ExpensesView.styles";
import { dashboardStyles } from "../components/screens/DashboardView.styles";
import { summaryStyles } from "../components/screens/SummaryView.styles";
import { statCardStyles } from "../components/ui/StatCard.styles";
import { modalHeaderStyles } from "../components/ui/ModalHeader.styles";
import { appShellStyles } from "../components/AppShell.styles";
import { exportModalStyles } from "../components/modals/ExportModal.styles";

export const styles = {
  ...base,
  ...loginStyles,
  ...settingsStyles,
  ...searchModalStyles,
  ...searchPageStyles,
  ...detailStyles,
  ...recordModalStyles,
  ...optionSheetStyles,
  ...bottomNavStyles,
  ...expensesStyles,
  ...dashboardStyles,
  ...summaryStyles,
  ...statCardStyles,
  ...modalHeaderStyles,
  ...appShellStyles,
  ...exportModalStyles,

  // Shell layout (only used by App.tsx root)
  safe: { flex: 1 } as const,
  shell: { flex: 1, flexDirection: "row" as const, padding: 12, gap: 12 },
  shellCompact: { flexDirection: "column" as const, padding: 0, gap: 0 },
  content: { flex: 1 },

  // ExportModal trigger (not in globalStyles originally, used inline)
  trigger: {} as const,
};
