import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  BackHandler,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Location, RequestPermissionsAccuracyOption } from "expo-location/next";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  MapPin,
  Plus,
  Users,
  Wallet,
} from "lucide-react-native";
import type { User } from "@supabase/supabase-js";
import { configured, supabase } from "./lib/supabase";
import {
  balances,
  parsePaise,
  rupees,
  transfers,
  type Expense as LedgerExpense,
  type Payment as LedgerPayment,
} from "./lib/money";

const siteUrl = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";
const openSite = (path: string) => {
  if (!siteUrl.startsWith("https://"))
    return Alert.alert(
      "Website not published",
      "The privacy and account deletion pages need a public HTTPS site URL before release.",
    );
  Linking.openURL(siteUrl + path).catch((e) =>
    Alert.alert("Could not open page", errorText(e)),
  );
};
const K = {
  bg: "#F8F6F1",
  white: "#FFFEFA",
  ink: "#173D3A",
  coral: "#DF765D",
  muted: "#66746F",
  mint: "#DCEBE4",
  line: "#E5E7E1",
  red: "#A43D3D",
};
type Trip = {
  id: string;
  title: string;
  status: "open" | "closed";
  organizer_id: string;
  created_at: string;
};
type Member = { id: string; name: string; user_id: string | null };
type Expense = LedgerExpense & {
  id: string;
  remark: string;
  created_at: string;
  created_by: string;
  location_lat: number | null;
  location_lng: number | null;
};
type Payment = LedgerPayment & { id: string; created_at: string };
type Detail = {
  trip: Trip;
  members: Member[];
  expenses: Expense[];
  payments: Payment[];
  upi: Record<string, string | null>;
};
type Profile = { display_name: string; upi_id: string | null };
type Page =
  | { name: "home" }
  | { name: "profile" }
  | { name: "trip"; id: string }
  | { name: "expense"; id: string; expense?: Expense };
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";
const date = (v: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(v));
function Btn({
  title,
  onPress,
  kind = "primary",
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "light" | "plain" | "danger";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        st.btn,
        kind === "primary"
          ? st.primary
          : kind === "light"
            ? st.light
            : kind === "danger"
              ? st.danger
              : st.plain,
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text
        style={[
          st.btnText,
          kind === "primary" && { color: K.white },
          kind === "danger" && { color: K.red },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  set,
  placeholder,
  keyboardType = "default",
  maxLength,
  dark = false,
}: {
  label: string;
  value: string;
  set: (s: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "decimal-pad" | "number-pad";
  maxLength?: number;
  dark?: boolean;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={[st.label, dark && { color: K.white }]}>{label}</Text>
      <TextInput
        style={st.input}
        value={value}
        onChangeText={set}
        placeholder={placeholder}
        placeholderTextColor="#89958F"
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        maxLength={maxLength}
      />
    </View>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  const motion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(motion, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [motion]);
  return (
    <Animated.View
      style={[
        st.card,
        {
          opacity: motion,
          transform: [
            {
              translateY: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
function Head({
  tag,
  title,
  sub,
}: {
  tag: string;
  title: string;
  sub?: string;
}) {
  return (
    <View style={{ gap: 7, marginVertical: 8 }}>
      <Text style={st.tag}>{tag}</Text>
      <Text style={st.title}>{title}</Text>
      {sub && <Text style={st.sub}>{sub}</Text>}
    </View>
  );
}
function Body({
  children,
  refresh,
}: {
  children: React.ReactNode;
  refresh?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={st.body}
      refreshControl={
        refresh ? (
          <RefreshControl
            refreshing={loading}
            onRefresh={async () => {
              setLoading(true);
              try {
                await refresh();
              } finally {
                setLoading(false);
              }
            }}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [profile, setProfile] = useState<Profile | null>(null),
    [trips, setTrips] = useState<Trip[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [page, setPage] = useState<Page>({ name: "home" }),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const listener = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        setProfile(null);
        setDetail(null);
        setPage({ name: "home" });
      }
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => {
      listener.data.subscription.unsubscribe();
      app.remove();
    };
  }, []);
  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name,upi_id")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    setProfile(data as Profile | null);
  }, [user]);
  const loadTrips = useCallback(async () => {
    const { data, error } = await supabase
      .from("trips")
      .select("id,title,status,organizer_id,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    setTrips((data ?? []) as Trip[]);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const [t, m, e, p, u] = await Promise.all([
      supabase
        .from("trips")
        .select("id,title,status,organizer_id,created_at")
        .eq("id", id)
        .single(),
      supabase
        .from("members")
        .select("id,name,user_id")
        .eq("trip_id", id)
        .order("created_at"),
      supabase
        .from("expenses")
        .select(
          "id,amount_paise,payer_member_id,remark,created_at,created_by,location_lat,location_lng,expense_shares(member_id,amount_paise)",
        )
        .eq("trip_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("payments")
        .select("id,from_member_id,to_member_id,amount_paise,status,created_at")
        .eq("trip_id", id)
        .order("created_at", { ascending: false }),
      supabase.rpc("trip_upi_ids", { p_trip: id }),
    ]);
    for (const result of [t, m, e, p, u]) if (result.error) throw result.error;
    const upi: Record<string, string | null> = {};
    for (const row of (u.data ?? []) as {
      user_id: string;
      upi_id: string | null;
    }[])
      upi[row.user_id] = row.upi_id;
    setDetail({
      trip: t.data as Trip,
      members: (m.data ?? []) as Member[],
      expenses: (e.data ?? []) as Expense[],
      payments: (p.data ?? []) as Payment[],
      upi,
    });
  }, []);
  useEffect(() => {
    if (user) {
      loadProfile().catch((e) => Alert.alert("Profile", errorText(e)));
      loadTrips().catch((e) => Alert.alert("Trips", errorText(e)));
    }
  }, [user, loadProfile, loadTrips]);
  useEffect(() => {
    if (page.name === "trip" || page.name === "expense")
      loadDetail(page.id).catch((e) => Alert.alert("Trip", errorText(e)));
  }, [page, loadDetail]);
  const run = async (action: () => Promise<void>, message?: string) => {
    setBusy(true);
    try {
      await action();
      if (message) Alert.alert("Saved", message);
    } catch (e) {
      Alert.alert("Could not save", errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (page.name === "expense") {
        setPage({ name: "trip", id: page.id });
        return true;
      }
      if (page.name !== "home") {
        setPage({ name: "home" });
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [page]);
  const back = () => setPage({ name: "home" });
  return (
    <SafeAreaProvider>
      <SafeAreaView style={st.root}>
        <StatusBar barStyle="dark-content" />
        {!configured ? (
          <Body>
            <Head
              tag="WAYFARE"
              title="Setup needed"
              sub="Set the public Supabase URL and key in mobile/.env.local."
            />
          </Body>
        ) : !ready ? (
          <View style={st.center}>
            <ActivityIndicator color={K.ink} size="large" />
          </View>
        ) : !user ? (
          <Login />
        ) : !profile ? (
          <ProfileForm user={user} busy={busy} run={run} saved={loadProfile} />
        ) : page.name === "home" ? (
          <Home
            profile={profile}
            trips={trips}
            busy={busy}
            run={run}
            open={(id) => setPage({ name: "trip", id })}
            onProfile={() => setPage({ name: "profile" })}
            created={async (id) => {
              await loadTrips();
              setPage({ name: "trip", id });
            }}
            refresh={loadTrips}
          />
        ) : page.name === "profile" ? (
          <ProfileForm
            user={user}
            profile={profile}
            busy={busy}
            run={run}
            saved={async () => {
              await loadProfile();
              back();
            }}
            back={back}
          />
        ) : page.name === "expense" ? (
          detail && detail.trip.id === page.id ? (
            <ExpenseForm
              detail={detail}
              initial={page.expense}
              user={user}
              busy={busy}
              run={run}
              back={() => setPage({ name: "trip", id: page.id })}
            />
          ) : (
            <View style={st.center}>
              <ActivityIndicator color={K.ink} />
            </View>
          )
        ) : detail && detail.trip.id === page.id ? (
          <TripPage
            detail={detail}
            user={user}
            busy={busy}
            run={run}
            back={back}
            add={(expense) =>
              setPage({ name: "expense", id: page.id, expense })
            }
            reload={() => loadDetail(page.id)}
          />
        ) : (
          <View style={st.center}>
            <ActivityIndicator color={K.ink} />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Login() {
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false);
  const send = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return Alert.alert("Email", "Enter a valid email address.");
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) Alert.alert("Could not send code", error.message);
    else {
      setSent(true);
      Alert.alert("Code sent", "Check your latest email.");
    }
  };
  const verify = async () => {
    if (!/^\d{6,8}$/.test(code.trim()))
      return Alert.alert("Code", "Enter the code from your latest email.");
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) Alert.alert("Code not accepted", error.message);
  };
  return (
    <Body>
      <View style={{ paddingTop: 46, gap: 12 }}>
        <View style={st.logo}>
          <Compass color={K.white} size={31} />
        </View>
        <Text style={st.brand}>Wayfare</Text>
        <Text style={st.title}>
          The trip feels better when the money is clear.
        </Text>
        <Text style={st.sub}>
          Share expenses with your crew. Settle up with confidence.
        </Text>
      </View>
      <Card>
        <Text style={st.h2}>{sent ? "Enter your code" : "Welcome aboard"}</Text>
        <Text style={st.help}>
          {sent
            ? `We emailed a sign-in code to ${email.trim()}.`
            : "Sign in or create an account with your email."}
        </Text>
        <Field
          label="Email address"
          value={email}
          set={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
        />
        {sent && (
          <Field
            label="One-time code"
            value={code}
            set={setCode}
            placeholder="6-digit code"
            keyboardType="number-pad"
            maxLength={8}
          />
        )}
        <Btn
          title={sent ? "Verify and continue" : "Send a code"}
          onPress={sent ? verify : send}
          disabled={busy}
        />
        {sent && (
          <Btn
            title="Send a new code"
            kind="plain"
            onPress={send}
            disabled={busy}
          />
        )}
      </Card>
      <Text style={st.help}>
        Your trip data is visible only to members of that trip.
      </Text>
      <Btn
        title="Read privacy policy"
        kind="plain"
        onPress={() => openSite("/privacy")}
      />
    </Body>
  );
}

function ProfileForm({
  user,
  profile,
  busy,
  run,
  saved,
  back,
}: {
  user: User;
  profile?: Profile;
  busy: boolean;
  run: (f: () => Promise<void>, m?: string) => Promise<void>;
  saved: () => Promise<void>;
  back?: () => void;
}) {
  const [name, setName] = useState(profile?.display_name ?? ""),
    [upi, setUpi] = useState(profile?.upi_id ?? "");
  const save = () =>
    run(
      async () => {
        if (!name.trim() || name.trim().length > 80)
          throw new Error("Enter your name, up to 80 characters.");
        if (
          upi.trim() &&
          !/^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,100}$/.test(upi.trim())
        )
          throw new Error("Enter a valid UPI ID or leave it blank.");
        const { error } = await supabase.from("profiles").upsert({
          id: user.id,
          email: user.email,
          display_name: name.trim(),
          upi_id: upi.trim() || null,
        });
        if (error) throw error;
        await saved();
      },
      profile ? "Profile updated." : undefined,
    );
  return (
    <Body>
      {back && <Btn title="← All trips" kind="plain" onPress={back} />}
      <Head
        tag="YOUR ACCOUNT"
        title={profile ? "Your profile" : "One last introduction"}
        sub="Friends will see this name when they add you to a trip."
      />
      <Card>
        <Field
          label="Your name"
          value={name}
          set={setName}
          placeholder="Your name"
          maxLength={80}
        />
        <Field
          label="UPI ID (optional)"
          value={upi}
          set={setUpi}
          placeholder="name@bank"
        />
        <Text style={st.help}>
          Trip members can open their payment app with this ID. Wayfare never
          transfers money.
        </Text>
        <Btn title="Save profile" onPress={save} disabled={busy} />
      </Card>
      {profile && (
        <Card>
          <Text style={st.h2}>Account</Text>
          <Text style={st.help}>{user.email}</Text>
          <Btn
            title="Privacy policy"
            kind="light"
            onPress={() => openSite("/privacy")}
          />
          <Btn
            title="Request account deletion"
            kind="light"
            onPress={() =>
              Alert.alert(
                "Request account deletion?",
                "This asks the Wayfare operator to delete your account and associated personal data. You can also request this on the website.",
                [
                  { text: "Cancel" },
                  {
                    text: "Request deletion",
                    style: "destructive",
                    onPress: () =>
                      run(async () => {
                        const { error } = await supabase.rpc(
                          "request_account_deletion",
                        );
                        if (error) throw error;
                      }, "Your request was recorded."),
                  },
                ],
              )
            }
          />
          <Btn
            title="Deletion information"
            kind="plain"
            onPress={() => openSite("/delete-account")}
          />
          <Btn
            title="Sign out"
            kind="plain"
            onPress={() => {
              supabase.auth.signOut();
            }}
          />
        </Card>
      )}
    </Body>
  );
}

function Home({
  profile,
  trips,
  busy,
  run,
  open,
  onProfile,
  created,
  refresh,
}: {
  profile: Profile;
  trips: Trip[];
  busy: boolean;
  run: (f: () => Promise<void>) => Promise<void>;
  open: (id: string) => void;
  onProfile: () => void;
  created: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  return (
    <Body refresh={refresh}>
      <View style={st.top}>
        <View style={st.brandRow}>
          <View style={st.logoSmall}>
            <Compass color={K.white} size={18} />
          </View>
          <Text style={st.brandSmall}>Wayfare</Text>
        </View>
        <Pressable
          onPress={onProfile}
          accessibilityLabel="Open profile"
          style={st.avatar}
        >
          <Text style={st.avatarText}>
            {profile.display_name[0]?.toUpperCase()}
          </Text>
        </Pressable>
      </View>
      <Head
        tag="GOOD TO SEE YOU"
        title={`Where to next, ${profile.display_name.split(" ")[0]}?`}
        sub="One shared place for every trip and every rupee."
      />
      <View style={st.hero}>
        <Text style={st.heroTag}>START SOMETHING NEW</Text>
        <Text style={st.heroTitle}>
          Make memories. We’ll keep the math tidy.
        </Text>
        <Field
          label="Trip name"
          value={title}
          set={setTitle}
          placeholder="Goa weekend"
          maxLength={100}
          dark
        />
        <Btn
          title="Create trip  →"
          disabled={busy}
          onPress={() =>
            run(async () => {
              if (!title.trim()) throw new Error("Enter a trip name.");
              const { data, error } = await supabase.rpc("create_trip", {
                p_title: title.trim(),
                p_name: profile.display_name,
              });
              if (error) throw error;
              setTitle("");
              await created(data as string);
            })
          }
        />
      </View>
      <Text style={st.h2}>Your trips {trips.length}</Text>
      {trips.length ? (
        trips.map((t) => (
          <Pressable key={t.id} onPress={() => open(t.id)} style={st.tripCard}>
            <View style={st.tripIcon}>
              <Compass color={K.ink} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.tripTitle}>{t.title}</Text>
              <Text style={st.meta}>
                {t.status === "open" ? "In progress" : "Ready to settle"} ·{" "}
                {date(t.created_at)}
              </Text>
            </View>
            <ArrowRight color={K.ink} size={20} />
          </Pressable>
        ))
      ) : (
        <Card>
          <Text style={st.h2}>Your first trip starts here</Text>
          <Text style={st.help}>
            Name your trip above, then add friends who have a Wayfare account.
          </Text>
        </Card>
      )}
    </Body>
  );
}

function TripPage({
  detail,
  user,
  busy,
  run,
  back,
  add,
  reload,
}: {
  detail: Detail;
  user: User;
  busy: boolean;
  run: (f: () => Promise<void>, m?: string) => Promise<void>;
  back: () => void;
  add: (e?: Expense) => void;
  reload: () => Promise<void>;
}) {
  const { trip, members, expenses, payments, upi } = detail;
  const [friend, setFriend] = useState("");
  const me = members.find((m) => m.user_id === user.id);
  const organizer = trip.organizer_id === user.id;
  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.name ?? "Unknown";
  const balance = useMemo(
    () =>
      balances(
        members.map((m) => m.id),
        expenses,
        payments,
      ),
    [members, expenses, payments],
  );
  const due = useMemo(() => transfers(balance), [balance]);
  const total = expenses.reduce((n, e) => n + e.amount_paise, 0);
  const share = expenses.reduce(
    (n, e) =>
      n +
      (e.expense_shares.find((x) => x.member_id === me?.id)?.amount_paise ?? 0),
    0,
  );
  const paid = expenses.reduce(
    (n, e) => n + (e.payer_member_id === me?.id ? e.amount_paise : 0),
    0,
  );
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(name, args);
    if (error) throw error;
    await reload();
  };
  if (!me)
    return (
      <Body>
        <Btn title="← All trips" kind="plain" onPress={back} />
        <Text style={st.help}>Your account is not linked to this trip.</Text>
      </Body>
    );
  return (
    <Body refresh={reload}>
      <Btn title="← All trips" kind="plain" onPress={back} />
      <Head
        tag={trip.status === "open" ? "TRIP IN PROGRESS" : "TIME TO SETTLE UP"}
        title={trip.title}
        sub={`${members.length} friends · ${expenses.length} expenses`}
      />
      <View style={st.stats}>
        <View style={st.statDark}>
          <Text style={st.statTag}>SPENT TOGETHER</Text>
          <Text style={st.statBig}>{rupees(total)}</Text>
        </View>
        <View style={st.statHalf}>
          <Text style={st.statTag}>YOUR SHARE</Text>
          <Text style={st.statValue}>{rupees(share)}</Text>
        </View>
        <View style={st.statHalf}>
          <Text style={st.statTag}>YOU PAID</Text>
          <Text style={st.statValue}>{rupees(paid)}</Text>
        </View>
        <View style={st.statDark}>
          <Text style={st.statTag}>
            {(balance.get(me.id) ?? 0) < 0 ? "YOU OWE" : "TO RECEIVE"}
          </Text>
          <Text style={st.statBig}>
            {rupees(Math.abs(balance.get(me.id) ?? 0))}
          </Text>
        </View>
      </View>
      {trip.status === "open" && (
        <Btn title="＋ Add an expense" onPress={() => add()} disabled={busy} />
      )}
      {trip.status === "closed" && (
        <Card>
          <Text style={st.h2}>Settle up</Text>
          <Text style={st.help}>
            Only payments confirmed by the recipient count as settled.
          </Text>
          {due.length ? (
            due.map((t, i) => {
              const recipient = members.find((m) => m.id === t.to);
              const upiId = recipient?.user_id ? upi[recipient.user_id] : null;
              const pending = payments.some(
                (p) =>
                  p.from_member_id === t.from &&
                  p.to_member_id === t.to &&
                  p.status === "sent",
              );
              return (
                <View key={`${t.from}-${t.to}-${i}`} style={st.list}>
                  <View style={st.row}>
                    <Text style={st.listTitle}>
                      {memberName(t.from)} → {memberName(t.to)}
                    </Text>
                    <Text style={st.amount}>{rupees(t.amount)}</Text>
                  </View>
                  {t.from === me.id && (
                    <View style={{ gap: 7, marginTop: 8 }}>
                      {upiId && (
                        <Btn
                          title={`Open UPI · ${upiId}`}
                          kind="light"
                          onPress={() => {
                            const url = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(memberName(t.to))}&am=${(t.amount / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(trip.title)}`;
                            Linking.openURL(url).catch(() =>
                              Alert.alert(
                                "UPI unavailable",
                                "Install a UPI app or use the recipient’s UPI ID.",
                              ),
                            );
                          }}
                        />
                      )}
                      {!upiId && (
                        <Text style={st.help}>
                          Ask {memberName(t.to)} for payment details.
                        </Text>
                      )}
                      {pending ? (
                        <Text style={st.pending}>Awaiting confirmation</Text>
                      ) : (
                        <Btn
                          title="I’ve sent the full amount"
                          kind="plain"
                          onPress={() =>
                            Alert.alert(
                              "Mark payment sent?",
                              `Confirm you sent ${rupees(t.amount)} to ${memberName(t.to)} outside Wayfare.`,
                              [
                                { text: "Cancel" },
                                {
                                  text: "I sent it",
                                  onPress: () =>
                                    run(() =>
                                      rpc("send_payment", {
                                        p_trip: trip.id,
                                        p_from: me.id,
                                        p_to: t.to,
                                        p_amount: t.amount,
                                      }),
                                    ),
                                },
                              ],
                            )
                          }
                        />
                      )}
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <Text style={st.help}>All square. Nothing left to pay.</Text>
          )}
        </Card>
      )}
      <Card>
        <View style={st.cardHead}>
          <Wallet color={K.coral} size={22} />
          <Text style={st.h2}>Expenses {expenses.length}</Text>
        </View>
        {expenses.length ? (
          expenses.map((e) => (
            <View key={e.id} style={st.list}>
              <View style={st.row}>
                <View style={{ flex: 1 }}>
                  <Text style={st.listTitle}>{e.remark}</Text>
                  <Text style={st.meta}>
                    Paid by {memberName(e.payer_member_id)}
                  </Text>
                </View>
                <Text style={st.amount}>{rupees(e.amount_paise)}</Text>
              </View>
              <Text style={st.meta}>
                Shared by{" "}
                {e.expense_shares
                  .map((x) => memberName(x.member_id))
                  .join(", ")}
              </Text>
              <Text style={st.meta}>{date(e.created_at)}</Text>
              {e.location_lat != null && e.location_lng != null && (
                <Btn
                  title="⌖ View location"
                  kind="plain"
                  onPress={() =>
                    Linking.openURL(
                      `https://www.openstreetmap.org/?mlat=${e.location_lat}&mlon=${e.location_lng}#map=16/${e.location_lat}/${e.location_lng}`,
                    )
                  }
                />
              )}{" "}
              {trip.status === "open" &&
                (e.created_by === user.id || organizer) && (
                  <View style={st.actions}>
                    <Btn title="Edit" kind="light" onPress={() => add(e)} />
                    <Btn
                      title="Delete"
                      kind="danger"
                      onPress={() =>
                        Alert.alert("Delete expense?", e.remark, [
                          { text: "Cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () =>
                              run(() =>
                                rpc("delete_expense", { p_expense: e.id }),
                              ),
                          },
                        ])
                      }
                    />
                  </View>
                )}
            </View>
          ))
        ) : (
          <Text style={st.help}>
            No expenses yet. Add your first shared moment.
          </Text>
        )}
      </Card>
      <Card>
        <View style={st.cardHead}>
          <Users color={K.coral} size={22} />
          <Text style={st.h2}>Your travel crew</Text>
        </View>
        {members.map((m, i) => (
          <View key={m.id} style={st.member}>
            <View
              style={[
                st.memberBadge,
                { backgroundColor: i % 2 ? "#F9E6DE" : K.mint },
              ]}
            >
              <Text style={st.badgeText}>{m.name[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.listTitle}>
                {m.name}
                {m.id === me.id ? " (you)" : ""}
              </Text>
              <Text style={st.meta}>
                {m.user_id ? "On Wayfare" : "Not linked"}
              </Text>
            </View>
            <Text
              style={[
                st.amount,
                { fontSize: 13 },
                (balance.get(m.id) ?? 0) < 0 && { color: K.red },
              ]}
            >
              {rupees(balance.get(m.id) ?? 0)}
            </Text>
          </View>
        ))}
        {organizer && trip.status === "open" && (
          <View style={{ gap: 9, marginTop: 8 }}>
            <Field
              label="Add friend by account email"
              value={friend}
              set={setFriend}
              placeholder="friend@example.com"
              keyboardType="email-address"
            />
            <Text style={st.help}>
              Your friend must first sign in and complete their profile.
            </Text>
            <Btn
              title="Add friend"
              kind="light"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(friend.trim()))
                    throw new Error("Enter a valid email.");
                  await rpc("connect_friend", {
                    p_trip: trip.id,
                    p_email: friend.trim().toLowerCase(),
                    p_member: null,
                  });
                  setFriend("");
                }, "Friend added to the trip.")
              }
            />
          </View>
        )}
      </Card>
      {payments.some((p) => p.status === "sent") && (
        <Card>
          <Text style={st.h2}>Payment activity</Text>
          {payments
            .filter((p) => p.status === "sent")
            .map((p) => (
              <View key={p.id} style={st.list}>
                <Text style={st.listTitle}>
                  {memberName(p.from_member_id)} → {memberName(p.to_member_id)}{" "}
                  · {rupees(p.amount_paise)}
                </Text>
                {p.to_member_id === me.id && (
                  <View style={st.actions}>
                    <Btn
                      title="Confirm received"
                      kind="light"
                      onPress={() =>
                        run(() =>
                          rpc("resolve_payment", {
                            p_payment: p.id,
                            p_confirm: true,
                          }),
                        )
                      }
                    />
                    <Btn
                      title="Reject"
                      kind="danger"
                      onPress={() =>
                        run(() =>
                          rpc("resolve_payment", {
                            p_payment: p.id,
                            p_confirm: false,
                          }),
                        )
                      }
                    />
                  </View>
                )}
              </View>
            ))}
        </Card>
      )}
      {organizer && trip.status === "open" && (
        <Card>
          <Text style={st.h2}>Wrap up the trip</Text>
          <Text style={st.help}>
            Review expenses first. Ending locks the trip and shows final
            payments.
          </Text>
          <Btn
            title="End trip"
            kind="light"
            disabled={busy}
            onPress={() =>
              Alert.alert(
                "End this trip?",
                "Expenses will lock and everyone can settle up.",
                [
                  { text: "Keep open" },
                  {
                    text: "End trip",
                    style: "destructive",
                    onPress: () =>
                      run(() => rpc("close_trip", { p_trip: trip.id })),
                  },
                ],
              )
            }
          />
        </Card>
      )}
    </Body>
  );
}

function ExpenseForm({
  detail,
  initial,
  user,
  busy,
  run,
  back,
}: {
  detail: Detail;
  initial?: Expense;
  user: User;
  busy: boolean;
  run: (f: () => Promise<void>, m?: string) => Promise<void>;
  back: () => void;
}) {
  const active = detail.members.filter((m) => m.user_id);
  const mine = active.find((m) => m.user_id === user.id);
  const [amount, setAmount] = useState(
      initial ? (initial.amount_paise / 100).toFixed(2) : "",
    ),
    [remark, setRemark] = useState(initial?.remark ?? ""),
    [payer, setPayer] = useState(initial?.payer_member_id ?? mine?.id ?? ""),
    [selected, setSelected] = useState<string[]>(
      initial
        ? initial.expense_shares.map((s) => s.member_id)
        : active.map((m) => m.id),
    ),
    [location, setLocation] = useState<{ lat: number; lng: number } | null>(
      initial?.location_lat != null && initial.location_lng != null
        ? {
            lat: Number(initial.location_lat),
            lng: Number(initial.location_lng),
          }
        : null,
    );
  const toggle = (id: string) =>
    setSelected((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
    );
  const capture = async () => {
    try {
      const permission = await Location.requestForegroundPermissions({
        accuracy: RequestPermissionsAccuracyOption.REDUCED,
      });
      if (!permission.granted)
        return Alert.alert("Location is optional", "You can save without it.");
      const p = await Location.getPosition({ maxCachedAge: 0, timeout: 20 });
      if (!p) throw new Error("No location fix available.");
      setLocation({
        lat: Math.round(p.coordinates.latitude * 100) / 100,
        lng: Math.round(p.coordinates.longitude * 100) / 100,
      });
    } catch (e) {
      Alert.alert("Location unavailable", errorText(e));
    }
  };
  return (
    <Body>
      <Btn title="← Trip details" kind="plain" onPress={back} />
      <Head
        tag="THE PAPER TRAIL"
        title={initial ? "Edit expense" : "Add an expense"}
        sub="Select exactly who shared this cost. For a purchase for one friend, select only that friend."
      />
      <Card>
        <Field
          label="Amount (₹)"
          value={amount}
          set={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />
        <Field
          label="What was it for?"
          value={remark}
          set={setRemark}
          placeholder="Dinner by the beach"
          maxLength={200}
        />
        <Text style={st.label}>PAID BY</Text>
        <View style={st.chips}>
          {active.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: payer === m.id }}
              onPress={() => setPayer(m.id)}
              style={[st.chip, payer === m.id && st.chipOn]}
            >
              <Text style={[st.chipText, payer === m.id && st.chipTextOn]}>
                {m.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={st.label}>SPLIT EQUALLY BETWEEN</Text>
        <View style={st.chips}>
          {active.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected.includes(m.id) }}
              onPress={() => toggle(m.id)}
              style={[st.chip, selected.includes(m.id) && st.chipOn]}
            >
              <Text
                style={[st.chipText, selected.includes(m.id) && st.chipTextOn]}
              >
                {m.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={st.cardHead}>
          <MapPin color={K.coral} size={20} />
          <View>
            <Text style={st.listTitle}>Location snapshot</Text>
            <Text style={st.meta}>
              {location
                ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
                : "Optional · captured only when you tap"}
            </Text>
          </View>
        </View>
        <View style={st.actions}>
          <Btn
            title={location ? "Update location" : "Add location"}
            kind="light"
            onPress={capture}
          />
          {location && (
            <Btn
              title="Remove"
              kind="plain"
              onPress={() => setLocation(null)}
            />
          )}
        </View>
        <Btn
          title={initial ? "Save changes" : "Add expense"}
          disabled={busy}
          onPress={() =>
            run(
              async () => {
                const paise = parsePaise(amount.trim());
                if (!remark.trim() || remark.trim().length > 200)
                  throw new Error("Enter a remark up to 200 characters.");
                if (!payer || !selected.length)
                  throw new Error(
                    "Choose a payer and at least one participant.",
                  );
                const { error } = await supabase.rpc("save_expense", {
                  p_trip: detail.trip.id,
                  p_expense: initial?.id ?? null,
                  p_payer: payer,
                  p_amount: paise,
                  p_remark: remark.trim(),
                  p_participants: selected,
                  p_latitude: location?.lat ?? null,
                  p_longitude: location?.lng ?? null,
                });
                if (error) throw error;
                back();
              },
              initial ? "Expense updated." : "Expense added.",
            )
          }
        />
      </Card>
    </Body>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: K.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  body: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 50,
    gap: 18,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
  },
  tag: { fontSize: 12, color: K.coral, fontWeight: "800", letterSpacing: 1.6 },
  title: {
    fontSize: 35,
    lineHeight: 40,
    color: K.ink,
    fontWeight: "800",
    letterSpacing: -1,
  },
  sub: { fontSize: 17, lineHeight: 25, color: K.muted },
  h2: { fontSize: 22, color: K.ink, fontWeight: "800" },
  help: { fontSize: 15, lineHeight: 22, color: K.muted },
  meta: { fontSize: 13, lineHeight: 20, color: K.muted },
  card: {
    backgroundColor: K.white,
    borderWidth: 1,
    borderColor: K.line,
    borderRadius: 21,
    padding: 19,
    gap: 13,
  },
  label: { color: K.ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
  input: {
    backgroundColor: K.white,
    borderColor: "#CBD5CE",
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 52,
    paddingHorizontal: 15,
    color: K.ink,
    fontSize: 17,
  },
  btn: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  primary: { backgroundColor: K.coral },
  light: { backgroundColor: K.mint },
  plain: { backgroundColor: "transparent" },
  danger: { backgroundColor: "#FBEDEB" },
  btnText: {
    fontSize: 15,
    fontWeight: "800",
    color: K.ink,
    textAlign: "center",
  },
  logo: {
    height: 62,
    width: 62,
    borderRadius: 18,
    backgroundColor: K.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 28, color: K.ink, fontWeight: "800" },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoSmall: {
    height: 34,
    width: 34,
    borderRadius: 10,
    backgroundColor: K.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  brandSmall: { fontSize: 22, color: K.ink, fontWeight: "800" },
  avatar: {
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: K.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 19, color: K.ink, fontWeight: "800" },
  hero: { backgroundColor: K.ink, padding: 20, borderRadius: 21, gap: 13 },
  heroTag: {
    fontSize: 12,
    color: K.mint,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 29,
    color: K.white,
    fontWeight: "800",
  },
  tripCard: {
    backgroundColor: K.white,
    borderColor: K.line,
    borderWidth: 1,
    borderRadius: 17,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tripIcon: {
    height: 48,
    width: 48,
    borderRadius: 14,
    backgroundColor: K.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  tripTitle: { fontSize: 19, color: K.ink, fontWeight: "800" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statDark: {
    width: "100%",
    backgroundColor: K.ink,
    borderRadius: 16,
    padding: 18,
    gap: 5,
  },
  statHalf: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: K.white,
    borderColor: K.line,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  statTag: {
    fontSize: 11,
    color: K.muted,
    fontWeight: "800",
    letterSpacing: 1,
  },
  statBig: { fontSize: 29, color: K.white, fontWeight: "800" },
  statValue: { fontSize: 21, color: K.ink, fontWeight: "800" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  list: { borderTopWidth: 1, borderTopColor: K.line, paddingTop: 12, gap: 3 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  listTitle: { fontSize: 16, color: K.ink, fontWeight: "700" },
  amount: { fontSize: 16, color: K.ink, fontWeight: "800" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  member: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: K.line,
    paddingTop: 12,
  },
  memberBadge: {
    height: 36,
    width: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 17, color: K.ink, fontWeight: "800" },
  pending: { fontSize: 14, color: K.coral, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#BDCBC2",
    borderRadius: 20,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipOn: { backgroundColor: K.ink, borderColor: K.ink },
  chipText: { fontSize: 15, color: K.ink, fontWeight: "700" },
  chipTextOn: { color: K.white },
});
