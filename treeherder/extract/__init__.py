import os
import sys

VENDOR_PATH = __file__.replace("__init__.py", "").rstrip(os.sep)+os.sep+"vendor"

if VENDOR_PATH not in sys.path:
    sys.path.append(VENDOR_PATH)
