#include <CoreGraphics/CoreGraphics.h>
#include <CoreFoundation/CoreFoundation.h>
#include <stdio.h>

/* Private smoke-probe JSON contract, version 1. Never dump the session dictionary. */
static int session_flag(CFDictionaryRef dictionary, CFStringRef key) {
  CFTypeRef value = CFDictionaryGetValue(dictionary, key);
  if (!value) return -1;
  if (CFGetTypeID(value) == CFBooleanGetTypeID()) {
    return CFBooleanGetValue(value) ? 1 : 0;
  }
  if (CFGetTypeID(value) == CFNumberGetTypeID()) {
    long long number;
    if (CFNumberGetValue(value, kCFNumberLongLongType, &number)) {
      return number != 0;
    }
  }
  return -1;
}

int main(void) {
  CFDictionaryRef dictionary = CGSessionCopyCurrentDictionary();
  if (!dictionary) {
    puts("{\"version\":1,\"dictionaryPresent\":false}");
    return 0;
  }
  printf("{\"version\":1,\"dictionaryPresent\":true,\"locked\":%d,\"onConsole\":%d}\n",
         session_flag(dictionary, CFSTR("CGSSessionScreenIsLocked")),
         session_flag(dictionary, CFSTR("kCGSSessionOnConsoleKey")));
  CFRelease(dictionary);
  return 0;
}
