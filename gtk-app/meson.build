project('audiophile-gtk', 'c',
  version: '1.0.0',
  default_options: ['c_std=c11'])

gtk = dependency('gtk4')
json_glib = dependency('json-glib-1.0')
curl = dependency('libcurl')

executable('audiophile-gtk',
  'src/main.c',
  dependencies: [gtk, json_glib, curl],
  install: true)
