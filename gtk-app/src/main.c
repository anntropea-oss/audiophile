#include <gtk/gtk.h>
#include <curl/curl.h>
#include <json-glib/json-glib.h>
#include <string.h>

typedef struct {
  GtkWindow *window;
  GtkLabel *status_label;
  GtkListBox *files_list;
  GtkListBox *results_list;
  GtkButton *process_button;
  GPtrArray *files;
  gchar *server_url;
} AppState;

typedef struct {
  AppState *app;
  gchar *text;
} StatusUpdate;

typedef struct {
  GtkListBox *list;
  JsonNode *root;
} ResultsUpdate;

typedef struct {
  GString *buf;
} CurlBuffer;

static size_t curl_write_cb(char *ptr, size_t size, size_t nmemb, void *userdata) {
  CurlBuffer *cb = userdata;
  g_string_append_len(cb->buf, ptr, size * nmemb);
  return size * nmemb;
}

static void clear_listbox(GtkListBox *list) {
  GtkWidget *child = gtk_widget_get_first_child(GTK_WIDGET(list));
  while (child) {
    GtkWidget *next = gtk_widget_get_next_sibling(child);
    gtk_widget_unparent(child);
    child = next;
  }
}

static gboolean is_audio_file(const gchar *name) {
  const gchar *ext = strrchr(name, '.');
  if (!ext) return FALSE;
  ext++;
  return g_ascii_strcasecmp(ext, "wav") == 0 ||
         g_ascii_strcasecmp(ext, "aiff") == 0 ||
         g_ascii_strcasecmp(ext, "aif") == 0 ||
         g_ascii_strcasecmp(ext, "mp3") == 0 ||
         g_ascii_strcasecmp(ext, "m4a") == 0;
}

static void add_file_row(GtkListBox *list, const gchar *path) {
  GtkWidget *row = gtk_list_box_row_new();
  GtkWidget *label = gtk_label_new(path);
  gtk_label_set_xalign(GTK_LABEL(label), 0.0);
  gtk_widget_set_margin_top(label, 6);
  gtk_widget_set_margin_bottom(label, 6);
  gtk_widget_set_margin_start(label, 8);
  gtk_widget_set_margin_end(label, 8);
  gtk_list_box_row_set_child(GTK_LIST_BOX_ROW(row), label);
  gtk_list_box_append(list, row);
}

static void refresh_files_list(AppState *app) {
  clear_listbox(app->files_list);
  for (guint i = 0; i < app->files->len; i++) {
    add_file_row(app->files_list, g_ptr_array_index(app->files, i));
  }
}

static void add_result_row(GtkListBox *list, const gchar *title, const gchar *status, const gchar *detail) {
  GtkWidget *row = gtk_list_box_row_new();
  GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
  GtkWidget *title_lbl = gtk_label_new(title);
  GtkWidget *status_lbl = gtk_label_new(status);
  GtkWidget *detail_lbl = gtk_label_new(detail);

  gtk_label_set_xalign(GTK_LABEL(title_lbl), 0.0);
  gtk_label_set_xalign(GTK_LABEL(status_lbl), 0.0);
  gtk_label_set_xalign(GTK_LABEL(detail_lbl), 0.0);

  gtk_widget_set_margin_top(box, 6);
  gtk_widget_set_margin_bottom(box, 6);
  gtk_widget_set_margin_start(box, 8);
  gtk_widget_set_margin_end(box, 8);

  gtk_box_append(GTK_BOX(box), title_lbl);
  gtk_box_append(GTK_BOX(box), status_lbl);
  gtk_box_append(GTK_BOX(box), detail_lbl);
  gtk_list_box_row_set_child(GTK_LIST_BOX_ROW(row), box);
  gtk_list_box_append(list, row);
}

static gboolean ui_set_status(gpointer data) {
  StatusUpdate *update = data;
  gtk_label_set_text(update->app->status_label, update->text);
  g_free(update->text);
  g_free(update);
  return G_SOURCE_REMOVE;
}

static const gchar *json_get_string_default(JsonObject *obj, const gchar *key, const gchar *fallback) {
  if (!json_object_has_member(obj, key)) return fallback;
  return json_object_get_string_member(obj, key);
}

static gboolean ui_update_results(gpointer data) {
  ResultsUpdate *update = data;
  JsonNode *root = update->root;
  JsonObject *obj = json_node_get_object(root);
  if (!obj) {
    json_node_unref(root);
    g_free(update);
    return G_SOURCE_REMOVE;
  }
  clear_listbox(update->list);

  JsonArray *results = json_object_get_array_member(obj, "results");
  if (results) {
    guint n = json_array_get_length(results);
    for (guint i = 0; i < n; i++) {
      JsonObject *item = json_array_get_object_element(results, i);
      const gchar *name = json_get_string_default(item, "name", "Unknown");
      const gchar *status = json_get_string_default(item, "status", "unknown");
      const gchar *wav = json_get_string_default(item, "wavUrl", "");
      const gchar *mp3 = json_get_string_default(item, "mp3Url", "");
      gchar *detail = g_strdup_printf("WAV: %s  MP3: %s", wav, mp3);
      add_result_row(update->list, name, status, detail);
      g_free(detail);
    }
  }

  json_node_unref(root);
  g_free(update);
  return G_SOURCE_REMOVE;
}

static gpointer process_thread(gpointer data) {
  AppState *app = data;
  CURL *curl = curl_easy_init();
  if (!curl) {
    g_idle_add((GSourceFunc)set_status, app);
    return NULL;
  }

  gchar *url = g_strdup_printf("%s/process", app->server_url);
  curl_easy_setopt(curl, CURLOPT_URL, url);

  curl_mime *mime = curl_mime_init(curl);
  curl_mimepart *part = NULL;

  part = curl_mime_addpart(mime);
  curl_mime_name(part, "normMode");
  curl_mime_data(part, "peak", CURL_ZERO_TERMINATED);

  part = curl_mime_addpart(mime);
  curl_mime_name(part, "targetDb");
  curl_mime_data(part, "-1.0", CURL_ZERO_TERMINATED);

  part = curl_mime_addpart(mime);
  curl_mime_name(part, "hpFreq");
  curl_mime_data(part, "60", CURL_ZERO_TERMINATED);

  part = curl_mime_addpart(mime);
  curl_mime_name(part, "compThreshold");
  curl_mime_data(part, "-24", CURL_ZERO_TERMINATED);

  part = curl_mime_addpart(mime);
  curl_mime_name(part, "compRatio");
  curl_mime_data(part, "3", CURL_ZERO_TERMINATED);

  part = curl_mime_addpart(mime);
  curl_mime_name(part, "limiterCeiling");
  curl_mime_data(part, "-1.0", CURL_ZERO_TERMINATED);

  part = curl_mime_addpart(mime);
  curl_mime_name(part, "mp3Export");
  curl_mime_data(part, "on", CURL_ZERO_TERMINATED);

  part = curl_mime_addpart(mime);
  curl_mime_name(part, "mp3Bitrate");
  curl_mime_data(part, "256k", CURL_ZERO_TERMINATED);

  for (guint i = 0; i < app->files->len; i++) {
    const gchar *path = g_ptr_array_index(app->files, i);
    part = curl_mime_addpart(mime);
    curl_mime_name(part, "files");
    curl_mime_filedata(part, path);
  }

  curl_easy_setopt(curl, CURLOPT_MIMEPOST, mime);

  CurlBuffer cb = {.buf = g_string_new(NULL)};
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curl_write_cb);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &cb);

  CURLcode res = curl_easy_perform(curl);
  long http_code = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);

  if (res != CURLE_OK || http_code >= 400) {
    StatusUpdate *update = g_new0(StatusUpdate, 1);
    update->app = app;
    update->text = g_strdup("Server error.");
    g_idle_add(ui_set_status, update);
  } else {
    JsonParser *parser = json_parser_new();
    if (json_parser_load_from_data(parser, cb.buf->str, cb.buf->len, NULL)) {
      JsonNode *root = json_node_copy(json_parser_get_root(parser));
      ResultsUpdate *update = g_new0(ResultsUpdate, 1);
      update->list = app->results_list;
      update->root = root;
      g_idle_add(ui_update_results, update);
    }
    g_object_unref(parser);
  }

  g_string_free(cb.buf, TRUE);
  curl_mime_free(mime);
  curl_easy_cleanup(curl);
  g_free(url);
  StatusUpdate *done = g_new0(StatusUpdate, 1);
  done->app = app;
  done->text = g_strdup("Done.");
  g_idle_add(ui_set_status, done);
  return NULL;
}

static void on_process_clicked(GtkButton *button, gpointer user_data) {
  AppState *app = user_data;
  if (app->files->len == 0) {
    StatusUpdate *update = g_new0(StatusUpdate, 1);
    update->app = app;
    update->text = g_strdup("No files selected.");
    g_idle_add(ui_set_status, update);
    return;
  }
  StatusUpdate *update = g_new0(StatusUpdate, 1);
  update->app = app;
  update->text = g_strdup("Processing...");
  g_idle_add(ui_set_status, update);
  g_thread_new("process-thread", process_thread, app);
}

static void on_files_chosen(GObject *source, GAsyncResult *res, gpointer user_data) {
  AppState *app = user_data;
  GtkFileDialog *dialog = GTK_FILE_DIALOG(source);
  GListModel *files = gtk_file_dialog_open_multiple_finish(dialog, res, NULL);
  if (!files) return;

  g_ptr_array_set_size(app->files, 0);
  for (guint i = 0; i < g_list_model_get_n_items(files); i++) {
    GFile *file = g_list_model_get_item(files, i);
    gchar *path = g_file_get_path(file);
    if (path && is_audio_file(path)) {
      g_ptr_array_add(app->files, path);
    } else {
      g_free(path);
    }
    g_object_unref(file);
  }
  g_object_unref(files);
  refresh_files_list(app);
  StatusUpdate *update = g_new0(StatusUpdate, 1);
  update->app = app;
  update->text = g_strdup("Files loaded.");
  g_idle_add(ui_set_status, update);
}

static void on_folder_chosen(GObject *source, GAsyncResult *res, gpointer user_data) {
  AppState *app = user_data;
  GtkFileDialog *dialog = GTK_FILE_DIALOG(source);
  GFile *folder = gtk_file_dialog_select_folder_finish(dialog, res, NULL);
  if (!folder) return;

  gchar *path = g_file_get_path(folder);
  if (path) {
    GDir *dir = g_dir_open(path, 0, NULL);
    if (dir) {
      g_ptr_array_set_size(app->files, 0);
      const gchar *name;
      while ((name = g_dir_read_name(dir)) != NULL) {
        if (is_audio_file(name)) {
          gchar *full = g_build_filename(path, name, NULL);
          g_ptr_array_add(app->files, full);
        }
      }
      g_dir_close(dir);
      refresh_files_list(app);
      StatusUpdate *update = g_new0(StatusUpdate, 1);
      update->app = app;
      update->text = g_strdup("Folder loaded.");
      g_idle_add(ui_set_status, update);
    }
    g_free(path);
  }
  g_object_unref(folder);
}

static void on_select_files(GtkButton *button, gpointer user_data) {
  AppState *app = user_data;
  GtkFileDialog *dialog = gtk_file_dialog_new();
  gtk_file_dialog_set_title(dialog, "Select audio files");
  gtk_file_dialog_open_multiple(dialog, GTK_WINDOW(app->window), NULL, on_files_chosen, app);
}

static void on_select_folder(GtkButton *button, gpointer user_data) {
  AppState *app = user_data;
  GtkFileDialog *dialog = gtk_file_dialog_new();
  gtk_file_dialog_set_title(dialog, "Select folder");
  gtk_file_dialog_select_folder(dialog, GTK_WINDOW(app->window), NULL, on_folder_chosen, app);
}

static void activate(GtkApplication *app, gpointer user_data) {
  AppState *state = user_data;

  GtkWidget *window = gtk_application_window_new(app);
  gtk_window_set_title(GTK_WINDOW(window), "AudioPhile");
  gtk_window_set_default_size(GTK_WINDOW(window), 1100, 740);

  GtkWidget *root = gtk_box_new(GTK_ORIENTATION_VERTICAL, 16);
  gtk_widget_set_margin_top(root, 16);
  gtk_widget_set_margin_bottom(root, 16);
  gtk_widget_set_margin_start(root, 16);
  gtk_widget_set_margin_end(root, 16);

  GtkWidget *header = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
  GtkWidget *title = gtk_label_new("AudioPhile");
  GtkWidget *subtitle = gtk_label_new("Batch master for broadcast-ready audio");
  gtk_widget_add_css_class(title, "title-1");
  gtk_box_append(GTK_BOX(header), title);
  gtk_box_append(GTK_BOX(header), subtitle);

  GtkWidget *button_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
  GtkWidget *folder_btn = gtk_button_new_with_label("Browse Folder");
  GtkWidget *files_btn = gtk_button_new_with_label("Select Files");
  GtkWidget *process_btn = gtk_button_new_with_label("Process");
  gtk_box_append(GTK_BOX(button_row), folder_btn);
  gtk_box_append(GTK_BOX(button_row), files_btn);
  gtk_box_append(GTK_BOX(button_row), process_btn);

  GtkWidget *status = gtk_label_new("Ready. Start the Node server at http://localhost:8080.");

  GtkWidget *files_label = gtk_label_new("Selected files");
  gtk_widget_set_margin_top(files_label, 8);
  GtkWidget *files_list = gtk_list_box_new();

  GtkWidget *results_label = gtk_label_new("Processed results");
  gtk_widget_set_margin_top(results_label, 8);
  GtkWidget *results_list = gtk_list_box_new();

  gtk_box_append(GTK_BOX(root), header);
  gtk_box_append(GTK_BOX(root), button_row);
  gtk_box_append(GTK_BOX(root), status);
  gtk_box_append(GTK_BOX(root), files_label);
  gtk_box_append(GTK_BOX(root), files_list);
  gtk_box_append(GTK_BOX(root), results_label);
  gtk_box_append(GTK_BOX(root), results_list);

  gtk_window_set_child(GTK_WINDOW(window), root);
  gtk_window_present(GTK_WINDOW(window));

  state->window = GTK_WINDOW(window);
  state->status_label = GTK_LABEL(status);
  state->files_list = GTK_LIST_BOX(files_list);
  state->results_list = GTK_LIST_BOX(results_list);
  state->process_button = GTK_BUTTON(process_btn);

  g_signal_connect(folder_btn, "clicked", G_CALLBACK(on_select_folder), state);
  g_signal_connect(files_btn, "clicked", G_CALLBACK(on_select_files), state);
  g_signal_connect(process_btn, "clicked", G_CALLBACK(on_process_clicked), state);
}

int main(int argc, char **argv) {
  AppState state = {0};
  state.files = g_ptr_array_new_with_free_func(g_free);
  state.server_url = g_strdup("http://localhost:8080");

  GtkApplication *app = gtk_application_new("com.audiophile.gtk", G_APPLICATION_DEFAULT_FLAGS);
  g_signal_connect(app, "activate", G_CALLBACK(activate), &state);
  int status = g_application_run(G_APPLICATION(app), argc, argv);
  g_object_unref(app);
  g_ptr_array_free(state.files, TRUE);
  g_free(state.server_url);
  return status;
}
