import { memo, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Image, Pressable, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Svg, { Defs, LinearGradient, Mask, Rect, Stop } from "react-native-svg";
import { styles } from "../styles/globalStyles";
import { Palette } from "../theme/colors";
import {
  ANIM_HEADER_BTN_IN,
  ANIM_HEADER_BTN_OUT,
  SPLASH_BG,
  SPLASH_SPINNER,
  SPLASH_INDICATOR_OFFSET,
} from "../theme/constants";
import { FontPreference, LanguageMode, MaterialIconName, SummaryRow, Tab, Tag, Transaction } from "../types";
import { UiCopy } from "../i18n";
import { PeriodControls } from "./layout/PeriodControls";
import { ExpensesView } from "./screens/ExpensesView";
import { SummaryView } from "./screens/SummaryView";
import { SettingsView } from "./screens/SettingsView";
import { Text } from "./ui/AppText";

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

export const HeaderActionButton = memo(function HeaderActionButton({
  colors,
  icon,
  iconColor,
  onPress,
}: {
  colors: Palette;
  icon: MaterialIconName;
  iconColor: string;
  onPress: () => void;
}) {
  const pressed = useRef(new Animated.Value(0)).current;
  const animate = (toValue: number, duration: number) => {
    pressed.stopAnimation();
    Animated.timing(pressed, {
      toValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };
  return (
    <Animated.View
      style={{
        opacity: pressed.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.8],
        }),
        transform: [
          {
            scale: pressed.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.94],
            }),
          },
        ],
      }}
    >
      <Pressable
        onPressIn={() => {
          animate(1, ANIM_HEADER_BTN_IN);
          onPress();
        }}
        onPressOut={() => animate(0, ANIM_HEADER_BTN_OUT)}
        accessibilityRole="button"
        hitSlop={6}
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.input,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
      </Pressable>
    </Animated.View>
  );
});

export const HeaderFade = memo(function HeaderFade({
  color,
  height,
}: {
  color: string;
  height: number;
}) {
  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height={height}
      style={{ position: "absolute", top: 0, left: 0, right: 0 }}
    >
      <Defs>
        <LinearGradient id="headerFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.55" />
          <Stop offset="0.38" stopColor={color} stopOpacity="0.35" />
          <Stop offset="0.72" stopColor={color} stopOpacity="0.10" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#headerFade)" />
    </Svg>
  );
});

export const HeaderTitleFade = memo(function HeaderTitleFade({
  color,
}: {
  color: string;
}) {
  return (
    <Svg
      pointerEvents="none"
      width="92%"
      height={70}
      style={styles.headerTitleFade}
    >
      <Defs>
        <LinearGradient
          id="headerTitleFadeHorizontal"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
        >
          <Stop offset="0" stopColor={color} stopOpacity="0.45" />
          <Stop offset="0.58" stopColor={color} stopOpacity="0.30" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient
          id="headerTitleFadeVertical"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <Stop offset="0.18" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="0.82" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </LinearGradient>
        <Mask id="headerTitleFadeMask">
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#headerTitleFadeVertical)"
          />
        </Mask>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="url(#headerTitleFadeHorizontal)"
        mask="url(#headerTitleFadeMask)"
      />
    </Svg>
  );
});

export const BottomFade = memo(function BottomFade({
  color,
  height,
}: {
  color: string;
  height: number;
}) {
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
  summary: SummaryRow;
  transactions: Transaction[];
  searchActive: boolean;
  searchText: string;
  selectedRows: number[];
  currencySymbol: string;
  copy: UiCopy;
  onExitSearch: () => void;
  onOpenDetail: (tx: Transaction) => void;
  onEdit: (tx: Transaction) => void;
  onDeleteSelected: () => void;
  onMove: (tx: Transaction) => void;
  onToggleSelection: (tx: Transaction) => void;
  onLoadOlder: () => void;
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
              styles.loadingBar,
              styles.loadingOverlay,
              { backgroundColor: loadingBar.cardColor },
            ]}
          >
            {loadingBar.syncing && (
              <ActivityIndicator color={loadingBar.primaryColor} />
            )}
            <Text style={{ color: loadingBar.mutedColor }}>{loadingBar.text}</Text>
          </View>
        )}
        {tab === "expenses" ? (
          <ExpensesView
            colors={tabProps.colors}
            summary={tabProps.summary}
            transactions={tabProps.transactions}
            searchActive={tabProps.searchActive}
            searchText={tabProps.searchText}
            selectedRows={tabProps.selectedRows}
            currencySymbol={tabProps.currencySymbol}
            copy={tabProps.copy}
            onExitSearch={tabProps.onExitSearch}
            onOpenDetail={tabProps.onOpenDetail}
            onEdit={tabProps.onEdit}
            onDeleteSelected={tabProps.onDeleteSelected}
            onMove={tabProps.onMove}
            onToggleSelection={tabProps.onToggleSelection}
            onLoadOlder={tabProps.onLoadOlder}
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
  expensesSubtitle: string;
  expensesAvailableYears: number[];
  expensesAvailableMonths: number[];
  expensesYear: number;
  expensesMonth: number;
  historyTint: string;
  onToggleTheme: () => void;
  onOpenHistory: () => void;
  onSelectPeriod: (month: number, year: number) => void;
  goToday: () => void;
  goPrevMonth: () => void;
  goNextMonth: () => void;
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
    expensesSubtitle,
    historyTint,
    onToggleTheme,
    onOpenHistory,
    copy,
    colors,
  } = props;
  const pageTitle =
    tab === "expenses"
      ? copy.expenses
      : tab === "summary"
        ? copy.summary
        : copy.settings;
  const pageSubtitle =
    tab === "expenses"
      ? expensesSubtitle
      : tab === "summary"
        ? copy.summarySubtitle
        : copy.settingsSubtitle;
  const showHeaderFade = tab === "expenses" || tab === "summary";
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
            styles.topBar,
            styles.topBarMobile,
            { backgroundColor: "transparent" },
          ]}
        >
          <HeaderTitleFade color={bg} />
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.headerLogo,
                { backgroundColor: colors.primary },
              ]}
            >
              <MaterialCommunityIcons
                name="sack"
                size={19}
                color={colors.onPrimary}
              />
            </View>
            <View style={styles.titleBlock}>
              <Text
                numberOfLines={1}
                style={[
                  styles.pageTitle,
                  styles.pageTitleMobile,
                  isDark
                    ? styles.headerReadableTextDark
                    : styles.headerReadableTextLight,
                  { color: colors.text, textShadowColor: colors.shadow },
                ]}
              >
                {pageTitle}
              </Text>
              {!!pageSubtitle && (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.pageSub,
                    styles.pageSubMobile,
                    isDark
                      ? styles.headerReadableTextDark
                      : styles.headerReadableTextLight,
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
              icon="history"
              iconColor={historyTint}
              onPress={onOpenHistory}
            />
          </View>
        </View>
        {tab === "expenses" && (
          <PeriodControls
            colors={colors}
            copy={copy}
            year={props.expensesYear}
            month={props.expensesMonth}
            availableYears={props.expensesAvailableYears}
            availableMonths={props.expensesAvailableMonths}
            onSelectPeriod={props.onSelectPeriod}
            goToday={props.goToday}
            goPrevMonth={props.goPrevMonth}
            goNextMonth={props.goNextMonth}
          />
        )}
      </View>
    </Animated.View>
  );
}

export const HeaderShell = memo(HeaderShellImpl);
