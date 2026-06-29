import { memo } from "react";
import { ActivityIndicator, Animated, Image, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { appShellStyles } from "./AppShell.styles";
import { Palette } from "../theme/colors";
import { SPLASH_BG, SPLASH_SPINNER, SPLASH_INDICATOR_OFFSET } from "../theme/constants";
import { FontPreference, LanguageMode, SummaryRow, Tab, Tag, Transaction } from "../types";
import { UiCopy } from "../i18n";
import { DashboardView } from "./screens/DashboardView";
import { ExpensesView } from "./screens/ExpensesView";
import { SummaryView } from "./screens/SummaryView";
import { SettingsView } from "./screens/SettingsView";
import { Text } from "./ui/AppText";
import { HeaderActionButton, HeaderFade, HeaderTitleFade } from "./layout/HeaderFades";

export function StartupSplash() {
  return (
    <View style={{ flex: 1, backgroundColor: SPLASH_BG }}>
      <Image
        source={require("../../assets/splash-bucks.png")}
        resizeMode="cover"
        style={{ width: "100%", height: "100%" }}
      />
      <ActivityIndicator
        color={SPLASH_SPINNER}
        style={{ position: "absolute", bottom: SPLASH_INDICATOR_OFFSET, alignSelf: "center" }}
      />
    </View>
  );
}

export const BottomFade = memo(function BottomFade({
  color,
  height,
}: {
  color: string;
  height: number;
}) {
  const Svg = require("react-native-svg").default;
  const { Defs, LinearGradient, Rect, Stop } = require("react-native-svg");
  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height={height}
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10 }}
    >
      <Defs>
        <LinearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0" />
          <Stop offset="0.36" stopColor={color} stopOpacity="0.16" />
          <Stop offset="0.70" stopColor={color} stopOpacity="0.58" />
          <Stop offset="1" stopColor={color} stopOpacity="0.86" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#bottomFade)" />
    </Svg>
  );
});

type ExpensesTabProps = {
  contentTopInset: number;
  colors: Palette;
  transactions: Transaction[];
  searchActive: boolean;
  searchText: string;
  selectedRows: number[];
  currencySymbol: string;
  copy: UiCopy;
  month: number;
  year: number;
  availableYears: number[];
  availableMonths: number[];
  onExitSearch: () => void;
  onOpenDetail: (tx: Transaction) => void;
  onEdit: (tx: Transaction) => void;
  onDeleteSelected: () => void;
  onMove: (tx: Transaction) => void;
  onToggleSelection: (tx: Transaction) => void;
  onLoadOlder: () => void;
  onSelectPeriod: (month: number, year: number) => void;
  goToday: () => void;
  goPrevMonth: () => void;
  goNextMonth: () => void;
  tagsList: Tag[];
};

type SummaryTabProps = {
  contentTopInset: number;
  colors: Palette;
  copy: UiCopy;
  summaries: SummaryRow[];
  transactions: Transaction[];
  freqIncome: Record<string, number>;
  availableYears: number[];
  currencySymbol: string;
};

type DashboardTabProps = {
  contentTopInset: number;
  colors: Palette;
  copy: UiCopy;
  allTransactions: Transaction[];
  tagsList: Tag[];
  currencySymbol: string;
  onOpenDetail: (tx: Transaction) => void;
};

type SettingsTabProps = {
  contentTopInset: number;
  colors: Palette;
  copy: UiCopy;
  language: LanguageMode;
  accountInfo: { name?: string; email?: string } | null;
  currencySymbol: string;
  fontPreference: FontPreference;
  colorSchemeLabel: string;
  pinEnabled: boolean;
  tagsCount: number;
  onOpenLanguage: () => void;
  onOpenCurrency: () => void;
  onOpenFont: () => void;
  onOpenColorScheme: () => void;
  onOpenPin: () => void;
  onOpenTags: () => void;
  onSwitch: () => void;
  onDisconnect: () => void;
  onOpenExport: () => void;
};

type LoadingBarProps = {
  visible: boolean;
  syncing: boolean;
  cardColor: string;
  primaryColor: string;
  mutedColor: string;
  text: string;
};

type TabPageProps =
  | {
      tab: "dashboard";
      isCurrent: boolean;
      props: DashboardTabProps;
      loadingBar: LoadingBarProps;
      tabWidth: number;
    }
  | {
      tab: "expenses";
      isCurrent: boolean;
      props: ExpensesTabProps;
      loadingBar: LoadingBarProps;
      tabWidth: number;
    }
  | {
      tab: "summary";
      isCurrent: boolean;
      props: SummaryTabProps;
      loadingBar: LoadingBarProps;
      tabWidth: number;
    }
  | {
      tab: "settings";
      isCurrent: boolean;
      props: SettingsTabProps;
      loadingBar: LoadingBarProps;
      tabWidth: number;
    };

function TabPageImpl(props: TabPageProps) {
  const { tab, isCurrent, props: tabProps, loadingBar, tabWidth } = props;
  const showSettingsTopPad = tab === "settings";
  return (
    <View
      pointerEvents={isCurrent ? "auto" : "none"}
      importantForAccessibility={isCurrent ? "auto" : "no-hide-descendants"}
      style={{ width: tabWidth, height: "100%", position: "relative" }}
    >
      <View
        style={[
          { flex: 1 },
          showSettingsTopPad && { paddingTop: tabProps.contentTopInset },
        ]}
      >
        {loadingBar.visible && (
          <View
            style={[
              appShellStyles.loadingBar,
              appShellStyles.loadingOverlay,
              { backgroundColor: loadingBar.cardColor },
            ]}
          >
            {loadingBar.syncing && (
              <ActivityIndicator color={loadingBar.primaryColor} />
            )}
            <Text style={{ color: loadingBar.mutedColor }}>{loadingBar.text}</Text>
          </View>
        )}
        {tab === "dashboard" ? (
          <DashboardView
            colors={tabProps.colors}
            copy={tabProps.copy}
            allTransactions={tabProps.allTransactions}
            tagsList={tabProps.tagsList}
            currencySymbol={tabProps.currencySymbol}
            onOpenDetail={tabProps.onOpenDetail}
            topInset={tabProps.contentTopInset}
          />
        ) : tab === "expenses" ? (
          <ExpensesView
            colors={tabProps.colors}
            transactions={tabProps.transactions}
            searchActive={tabProps.searchActive}
            searchText={tabProps.searchText}
            selectedRows={tabProps.selectedRows}
            currencySymbol={tabProps.currencySymbol}
            copy={tabProps.copy}
            month={tabProps.month}
            year={tabProps.year}
            availableYears={tabProps.availableYears}
            availableMonths={tabProps.availableMonths}
            onExitSearch={tabProps.onExitSearch}
            onOpenDetail={tabProps.onOpenDetail}
            onEdit={tabProps.onEdit}
            onDeleteSelected={tabProps.onDeleteSelected}
            onMove={tabProps.onMove}
            onToggleSelection={tabProps.onToggleSelection}
            onLoadOlder={tabProps.onLoadOlder}
            onSelectPeriod={tabProps.onSelectPeriod}
            goToday={tabProps.goToday}
            goPrevMonth={tabProps.goPrevMonth}
            goNextMonth={tabProps.goNextMonth}
            topInset={tabProps.contentTopInset}
            tagsList={tabProps.tagsList}
          />
        ) : tab === "summary" ? (
          <SummaryView
            colors={tabProps.colors}
            copy={tabProps.copy}
            summaries={tabProps.summaries}
            transactions={tabProps.transactions}
            freqIncome={tabProps.freqIncome}
            availableYears={tabProps.availableYears}
            topInset={tabProps.contentTopInset}
            currencySymbol={tabProps.currencySymbol}
          />
        ) : (
          <SettingsView
            colors={tabProps.colors}
            copy={tabProps.copy}
            language={tabProps.language}
            accountInfo={tabProps.accountInfo}
            currencySymbol={tabProps.currencySymbol}
            fontPreference={tabProps.fontPreference}
            colorSchemeLabel={tabProps.colorSchemeLabel}
            pinEnabled={tabProps.pinEnabled}
            tagsCount={tabProps.tagsCount}
            onOpenLanguage={tabProps.onOpenLanguage}
            onOpenCurrency={tabProps.onOpenCurrency}
            onOpenFont={tabProps.onOpenFont}
            onOpenColorScheme={tabProps.onOpenColorScheme}
            onOpenPin={tabProps.onOpenPin}
            onOpenTags={tabProps.onOpenTags}
            onSwitch={tabProps.onSwitch}
            onDisconnect={tabProps.onDisconnect}
            onOpenExport={tabProps.onOpenExport}
          />
        )}
      </View>
    </View>
  );
}

export const TabPage = memo(TabPageImpl);

export type HeaderShellProps = {
  tab: Tab;
  bg: string;
  isDark: boolean;
  headerTopInset: number;
  headerFadeHeight: number;
  historyTint: string;
  onToggleTheme: () => void;
  onOpenHistory: () => void;
  onOpenSearch: () => void;
  copy: UiCopy;
};

function HeaderShellImpl(
  props: HeaderShellProps & {
    colors: Palette;
  },
) {
  const {
    tab,
    bg,
    isDark,
    headerTopInset,
    headerFadeHeight,
    historyTint,
    onToggleTheme,
    onOpenHistory,
    onOpenSearch,
    copy,
    colors,
  } = props;
  const pageTitle =
    tab === "dashboard"
      ? copy.dashboard
      : tab === "expenses"
        ? copy.expenses
        : tab === "summary"
          ? copy.summary
          : copy.settings;
  const pageSubtitle =
    tab === "dashboard"
      ? copy.dashboardSubtitle
      : tab === "summary"
        ? copy.summarySubtitle
        : copy.settingsSubtitle;
  const showHeaderFade = tab === "dashboard" || tab === "expenses" || tab === "summary";
  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
      }}
      pointerEvents="box-none"
    >
      {showHeaderFade && <HeaderFade color={bg} height={headerFadeHeight} />}
      <View pointerEvents="box-none" style={{ paddingTop: headerTopInset }}>
        <View
          style={[
            appShellStyles.topBar,
            appShellStyles.topBarMobile,
            { backgroundColor: "transparent" },
          ]}
        >
          <HeaderTitleFade color={bg} />
          <View style={appShellStyles.headerLeft}>
            <View
              style={[
                appShellStyles.headerLogo,
                { backgroundColor: colors.primary },
              ]}
            >
              <MaterialCommunityIcons
                name="sack"
                size={19}
                color={colors.onPrimary}
              />
            </View>
            <View style={appShellStyles.titleBlock}>
              <Text
                numberOfLines={1}
                style={[
                  appShellStyles.pageTitle,
                  appShellStyles.pageTitleMobile,
                  isDark
                    ? appShellStyles.headerReadableTextDark
                    : appShellStyles.headerReadableTextLight,
                  { color: colors.text, textShadowColor: colors.shadow },
                ]}
              >
                {pageTitle}
              </Text>
              {!!pageSubtitle && (
                <Text
                  numberOfLines={1}
                  style={[
                    appShellStyles.pageSub,
                    appShellStyles.pageSubMobile,
                    isDark
                      ? appShellStyles.headerReadableTextDark
                      : appShellStyles.headerReadableTextLight,
                    { color: colors.muted, textShadowColor: colors.shadow },
                  ]}
                >
                  {pageSubtitle}
                </Text>
              )}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <HeaderActionButton
              colors={colors}
              icon={isDark ? "weather-night" : "white-balance-sunny"}
              iconColor={colors.yellow}
              onPress={onToggleTheme}
            />
            <HeaderActionButton
              colors={colors}
              icon="magnify"
              iconColor={colors.primary}
              onPress={onOpenSearch}
            />
            <HeaderActionButton
              colors={colors}
              icon="history"
              iconColor={historyTint}
              onPress={onOpenHistory}
            />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

export const HeaderShell = memo(HeaderShellImpl);
