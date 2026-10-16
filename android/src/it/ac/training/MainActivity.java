package it.ac.training;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.widget.RemoteViews;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Guscio Android di AC Training: una WebView che mostra l'app web pubblicata su GitHub Pages.
 * Così ogni modifica pubblicata arriva sul telefono alla riapertura, senza reinstallare l'APK;
 * il service worker dell'app la tiene in memoria per l'uso offline. Qui resta solo ciò che
 * il browser da solo non sa fare: backup in Download, selettore di file, tasto Indietro e
 * aggiornamento dell'APK stesso. I dati (schede, allenamenti, misure) restano nel telefono.
 */
public class MainActivity extends Activity {
    private static final String HOST = "gavao.github.io";
    private static final String HOME = "https://" + HOST + "/ac-training/";
    private static final String OFFLINE_PAGE = "<html><body style='background:#0d1712;color:#e6f4ea;"
            + "font-family:sans-serif;text-align:center;padding:40% 24px'>"
            + "<p>Per il primo avvio AC Training ha bisogno della connessione a internet.</p>"
            + "<p><a href='" + HOME + "' style='color:#4ade80'>Riprova</a></p></body></html>";
    private static final String BACKUP_DIR = Environment.DIRECTORY_DOWNLOADS + "/ACTraining";
    private static final String BACKUP_NAME = "ac-training-backup.json";
    private static final int PICK_FILE = 1;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private boolean askedNotifications = false;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFF0D1712);
        getWindow().setNavigationBarColor(0xFF132219);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0D1712);
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);   // suono di fine recupero

        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (HOST.equals(request.getUrl().getHost())) return false;
                openExternal(request.getUrl());   // i link esterni (es. i video su YouTube) si aprono fuori
                return true;
            }

            // Solo se l'app non è mai stata aperta online: dopo, la serve il service worker.
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) view.loadDataWithBaseURL(HOME, OFFLINE_PAGE, "text/html", "utf-8", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // <input type="file">: serve per importare una scheda o ripristinare un backup.
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try {
                    startActivityForResult(pick, PICK_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });

        web.loadUrl(HOME);
        createChannels();
    }

    // -----------------------------------------------------------------------------------------
    // Recupero tra le serie. L'app web dice quando finisce (restStart) o se viene saltato (restStop).
    // Se chiudi l'app mentre scorre, compare una notifica con il conto alla rovescia (toccandola si
    // riapre l'app); alla fine arriva l'avviso con suono e vibrazione anche ad app chiusa.
    // -----------------------------------------------------------------------------------------
    private static final String CH_RUNNING = "rest_running";
    private static final String CH_DONE = "rest_done";
    private static final int NOTIF_REST = 10;
    private static final int NOTIF_PERMISSION = 3;
    private static final long[] DONE_PATTERN = {0, 600, 200, 600, 200, 900};

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable restEnded = this::onRestEnd;
    private long restEnd = 0;
    private String restLabel = "";
    private boolean visible = true;

    private void createChannels() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel running = new NotificationChannel(CH_RUNNING, "Recupero in corso", NotificationManager.IMPORTANCE_HIGH);
        running.setDescription("Conto alla rovescia del recupero quando l'app è chiusa");
        running.setSound(null, null);
        running.enableVibration(false);
        NotificationChannel done = new NotificationChannel(CH_DONE, "Fine recupero", NotificationManager.IMPORTANCE_HIGH);
        done.setDescription("Avviso con suono e vibrazione quando il recupero è finito");
        done.enableVibration(true);
        done.setVibrationPattern(DONE_PATTERN);
        done.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        nm.createNotificationChannel(running);
        nm.createNotificationChannel(done);
    }

    private PendingIntent openApp() {
        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        return PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private RemoteViews restView(boolean done) {
        RemoteViews v = new RemoteViews(getPackageName(), R.layout.rest_notification);
        v.setTextViewText(R.id.rest_title, done ? "RECUPERO FINITO" : "RECUPERO");
        v.setTextViewText(R.id.rest_label, restLabel.isEmpty() ? "Torna all'allenamento" : restLabel);
        if (done) {
            v.setViewVisibility(R.id.rest_chrono, View.GONE);
            v.setViewVisibility(R.id.rest_done, View.VISIBLE);
        } else {
            long base = SystemClock.elapsedRealtime() + Math.max(0, restEnd - System.currentTimeMillis());
            v.setChronometer(R.id.rest_chrono, base, null, true);
            v.setChronometerCountDown(R.id.rest_chrono, true);
        }
        return v;
    }

    private void showRunning() {
        if (restEnd <= System.currentTimeMillis()) return;
        RemoteViews view = restView(false);
        Notification n = new Notification.Builder(this, CH_RUNNING)
                .setSmallIcon(R.drawable.ic_stat_rest)
                .setColor(0xFF22C55E)
                .setContentTitle("Recupero")
                .setContentText(restLabel)
                .setCustomContentView(view)
                .setCustomHeadsUpContentView(view)
                .setStyle(new Notification.DecoratedCustomViewStyle())
                .setContentIntent(openApp())
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .setTimeoutAfter(Math.max(1000, restEnd - System.currentTimeMillis() + 500))
                .build();
        postRest(n);
    }

    private void onRestEnd() {
        if (restEnd == 0) return;
        restEnd = 0;
        if (visible) return;   // app aperta: suono e vibrazione li fa l'app web
        RemoteViews view = restView(true);
        Notification n = new Notification.Builder(this, CH_DONE)
                .setSmallIcon(R.drawable.ic_stat_rest)
                .setColor(0xFF22C55E)
                .setContentTitle("Recupero finito")
                .setContentText(restLabel)
                .setCustomContentView(view)
                .setCustomHeadsUpContentView(view)
                .setStyle(new Notification.DecoratedCustomViewStyle())
                .setContentIntent(openApp())
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_ALARM)
                .setTimeoutAfter(120000)
                .build();
        postRest(n);
    }

    private void postRest(Notification n) {
        try {
            getSystemService(NotificationManager.class).notify(NOTIF_REST, n);
        } catch (SecurityException ignored) {
            // notifiche non permesse
        }
    }

    private void cancelRestNotification() {
        getSystemService(NotificationManager.class).cancel(NOTIF_REST);
    }

    @Override
    protected void onStart() {
        super.onStart();
        visible = true;
        cancelRestNotification();   // tornato nell'app: il recupero lo mostra lei
    }

    @Override
    protected void onStop() {
        super.onStop();
        visible = false;
        showRunning();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != PICK_FILE || fileCallback == null) return;
        Uri picked = resultCode == RESULT_OK && data != null ? data.getData() : null;
        fileCallback.onReceiveValue(picked == null ? null : new Uri[]{picked});
        fileCallback = null;
    }

    /** Tasto Indietro: prima chiude la finestra aperta, poi torna alla pagina precedente, infine esce. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.appBack ? window.appBack() : false", handled -> {
            if ("true".equals(handled)) return;
            if (web.canGoBack()) web.goBack();
            else finish();
        });
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            // nessuna app in grado di aprirlo
        }
    }

    /**
     * Scarica il nuovo APK con il gestore download di Android e, finito, apre l'installazione.
     * La prima volta Android chiede di consentire a AC Training di installare app: si apre
     * l'impostazione apposita e, dopo averla attivata, basta toccare di nuovo "Aggiorna".
     */
    private void startUpdate(String url) {
        if (!getPackageManager().canRequestPackageInstalls()) {
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())));
            return;
        }
        DownloadManager downloads = getSystemService(DownloadManager.class);
        java.io.File old = new java.io.File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "AC-Training-update.apk");
        if (old.exists()) old.delete();
        long id = downloads.enqueue(new DownloadManager.Request(Uri.parse(url))
                .setTitle("Aggiornamento AC Training")
                .setMimeType("application/vnd.android.package-archive")
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "AC-Training-update.apk")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE));

        BroadcastReceiver done = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
                unregisterReceiver(this);
                Uri apk = downloads.getUriForDownloadedFile(id);
                if (apk == null) return;   // download non riuscito
                startActivity(new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(apk, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(done, filter, Context.RECEIVER_EXPORTED);
        else registerReceiver(done, filter);
    }

    /** Funzioni native richiamabili dall'app web come window.Android. */
    private class Bridge {
        /** Versione dell'APK installato, es. "1.1": l'app web la confronta con l'ultima release su GitHub. */
        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "0";
            }
        }

        /** Inizio (o cambio) del recupero: endMillis = quando finisce, label = cosa c'è dopo. */
        @JavascriptInterface
        public void restStart(double endMillis, String label) {
            runOnUiThread(() -> {
                restEnd = (long) endMillis;
                restLabel = label == null ? "" : label;
                handler.removeCallbacks(restEnded);
                handler.postDelayed(restEnded, Math.max(0, restEnd - System.currentTimeMillis()));
                if (!visible) showRunning();
                // Android 13+: il permesso per le notifiche si chiede la prima volta che serve.
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        && !askedNotifications) {
                    askedNotifications = true;
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIF_PERMISSION);
                }
            });
        }

        /** Recupero saltato o allenamento finito. */
        @JavascriptInterface
        public void restStop() {
            runOnUiThread(() -> {
                restEnd = 0;
                handler.removeCallbacks(restEnded);
                cancelRestNotification();
            });
        }

        /** Vibrazione (es. "0,600,200,600"): millisecondi di pausa e di vibrazione alternati. */
        @JavascriptInterface
        public void vibrate(String pattern) {
            try {
                String[] parts = pattern.split(",");
                long[] ms = new long[parts.length];
                for (int i = 0; i < parts.length; i++) ms[i] = Long.parseLong(parts[i].trim());
                Vibrator v = getSystemService(Vibrator.class);
                if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createWaveform(ms, -1));
            } catch (Exception ignored) {
                // vibrazione non disponibile
            }
        }

        @JavascriptInterface
        public void installUpdate(String url) {
            runOnUiThread(() -> startUpdate(url));
        }

        /** Condivide un testo con un'altra app (WhatsApp, email…), dal menu di condivisione di Android. */
        @JavascriptInterface
        public void shareText(String title, String text) {
            Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(send, title)));
        }

        /**
         * Salva un file di testo (es. l'esportazione per Excel) in Download/ACTraining e restituisce il
         * percorso, oppure una stringa vuota se non riesce.
         */
        @JavascriptInterface
        public String saveFile(String name, String mime, String content) {
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, BACKUP_DIR);
                Uri target = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                try (OutputStream out = getContentResolver().openOutputStream(target, "wt")) {
                    out.write(content.getBytes(StandardCharsets.UTF_8));
                }
                return "Download/ACTraining/" + name;
            } catch (Exception e) {
                return "";
            }
        }

        /**
         * Scrive la copia di sicurezza in Download/ACTraining, una cartella che resta anche se
         * l'app viene disinstallata. Restituisce il percorso, oppure una stringa vuota se fallisce.
         */
        @JavascriptInterface
        public String saveBackup(String json) {
            try {
                writeBackup(json);
                return "Download/ACTraining/" + BACKUP_NAME;
            } catch (Exception e) {
                return "";
            }
        }

        /**
         * Aggiorna la copia di sicurezza e la passa al menu di condivisione di Android: da lì si sceglie
         * "Salva su Drive" (o email, WhatsApp…). Restituisce false se non riesce.
         */
        @JavascriptInterface
        public boolean shareBackup(String json) {
            try {
                share(writeBackup(json), "application/json", "Backup AC Training");
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Salva un file in Download/ACTraining (es. l'esportazione per Excel) e lo passa al menu di condivisione. */
        @JavascriptInterface
        public boolean shareFile(String name, String mime, String content) {
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, BACKUP_DIR);
                Uri target = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                try (OutputStream out = getContentResolver().openOutputStream(target, "wt")) {
                    out.write(content.getBytes(StandardCharsets.UTF_8));
                }
                share(target, mime, name);
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }

    /** Scrive (o sovrascrive) la copia di sicurezza in Download/ACTraining e ne restituisce l'indirizzo. */
    private Uri writeBackup(String json) throws IOException {
        ContentResolver resolver = getContentResolver();
        Uri downloads = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
        Uri target = null;
        try (Cursor c = resolver.query(downloads, new String[]{MediaStore.MediaColumns._ID},
                MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " + MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ?",
                new String[]{BACKUP_NAME, "%ACTraining%"}, null)) {
            if (c != null && c.moveToFirst()) target = ContentUris.withAppendedId(downloads, c.getLong(0));
        }
        if (target == null) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, BACKUP_NAME);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, BACKUP_DIR);
            target = resolver.insert(downloads, values);
        }
        try (OutputStream out = resolver.openOutputStream(target, "wt")) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
        }
        return target;
    }

    private void share(Uri uri, String mime, String title) {
        Intent send = new Intent(Intent.ACTION_SEND).setType(mime)
                .putExtra(Intent.EXTRA_STREAM, uri).putExtra(Intent.EXTRA_SUBJECT, title)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        runOnUiThread(() -> startActivity(Intent.createChooser(send, title)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)));
    }
}
