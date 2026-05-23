#!/usr/bin/env python3
"""
OTP Runner - JSON-based command interface for the web backend
Receives JSON commands via stdin, outputs JSON results via stdout
"""

import asyncio
import json
import sys
import os
import time

# Add the directory containing core.py to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core import (
    DeviceIdentityGenerator, ProxyManager, CapCutOTPSender,
    TaskManager, parse_phone_numbers, parse_proxies,
    get_pakistan_time, SIGNERPY_AVAILABLE, run_bulk_task,
    identity_generator, task_manager
)

# Store senders for task management
senders = {}

async def cmd_send_single(args):
    """Send single OTP"""
    phone = args.get("phone", "")
    proxy = args.get("proxy", None)
    
    if not phone:
        return {"success": False, "error": "Phone number required"}
    
    proxy_manager = ProxyManager([proxy] if proxy else [])
    sender = CapCutOTPSender(identity_generator, proxy_manager)
    
    identity = sender.refresh_identity()
    result = sender.send_otp(phone, proxy)
    
    return {
        "success": result.get("success", False),
        "phone": phone,
        "proxy_used": result.get("proxy_used", proxy or "Direct"),
        "status": result.get("message", result.get("error", "Unknown")),
        "time_ms": result.get("time_ms", 0),
        "device_brand": identity.get("device_brand", ""),
        "device_model": identity.get("model", ""),
        "device_id": identity.get("device_id", ""),
        "raw": result
    }

async def cmd_start_bulk(args):
    """Start bulk OTP task"""
    phones = args.get("phones", [])
    proxies = args.get("proxies", [])
    
    if not phones:
        return {"success": False, "error": "No phone numbers provided"}
    
    chat_id = args.get("chat_id", "web_" + str(int(time.time())))
    task_id = await task_manager.create_task(phones, proxies, chat_id)
    task = task_manager.get_task(task_id)
    task.status = "running"
    task_manager.running_tasks.add(task_id)
    
    # Start the task in background
    asyncio.create_task(run_bulk_task(task))
    
    return {
        "success": True,
        "task_id": task_id,
        "total_numbers": len(phones),
        "total_proxies": len(proxies),
        "status": "started"
    }

async def cmd_get_task_status(args):
    """Get task status"""
    task_id = args.get("task_id", "")
    task = task_manager.get_task(task_id)
    
    if not task:
        return {"success": False, "error": "Task not found"}
    
    total = len(task.phone_numbers)
    progress = (task.current_index / total * 100) if total > 0 else 0
    
    return {
        "success": True,
        "task_id": task_id,
        "status": task.status,
        "progress": progress,
        "current_index": task.current_index,
        "total": total,
        "success_count": task.success_count,
        "fail_count": task.fail_count,
        "cancelled": task.cancelled
    }

async def cmd_cancel_task(args):
    """Cancel a running task"""
    task_id = args.get("task_id", "")
    success = await task_manager.cancel_task(task_id)
    return {"success": success, "task_id": task_id}

async def cmd_get_all_tasks(args):
    """Get all tasks"""
    tasks = task_manager.get_all_tasks()
    return {
        "success": True,
        "tasks": [
            {
                "task_id": t.task_id,
                "status": t.status,
                "current_index": t.current_index,
                "total": len(t.phone_numbers),
                "success_count": t.success_count,
                "fail_count": t.fail_count,
                "cancelled": t.cancelled
            }
            for t in tasks[-20:]
        ]
    }

async def cmd_parse_numbers(args):
    """Parse phone numbers from text"""
    text = args.get("text", "")
    numbers = parse_phone_numbers(text)
    return {"success": True, "count": len(numbers), "numbers": numbers}

async def cmd_parse_proxies(args):
    """Parse proxies from text"""
    text = args.get("text", "")
    proxies = parse_proxies(text)
    return {"success": True, "count": len(proxies), "proxies": proxies}

async def cmd_get_status(args):
    """Get bot status"""
    stats = identity_generator.get_stats()
    running = task_manager.get_running_count()
    pk_time = get_pakistan_time().strftime("%Y-%m-%d %I:%M:%S %p")
    
    return {
        "success": True,
        "signerpy_available": SIGNERPY_AVAILABLE,
        "pakistan_time": pk_time,
        "running_tasks": running,
        "ids_generated": stats["total_generated"],
        "unique_device_ids": stats["unique_device_ids"],
        "unique_iids": stats["unique_iids"]
    }

async def main():
    """Main loop - read JSON commands from stdin, write JSON results to stdout"""
    print(json.dumps({"ready": True, "signerpy": SIGNERPY_AVAILABLE}), flush=True)
    
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            
            line = line.strip()
            if not line:
                continue
            
            cmd = json.loads(line)
            command = cmd.get("command", "")
            args = cmd.get("args", {})
            request_id = cmd.get("id", "")
            
            handlers = {
                "send_single": cmd_send_single,
                "start_bulk": cmd_start_bulk,
                "task_status": cmd_get_task_status,
                "cancel_task": cmd_cancel_task,
                "all_tasks": cmd_get_all_tasks,
                "parse_numbers": cmd_parse_numbers,
                "parse_proxies": cmd_parse_proxies,
                "status": cmd_get_status,
            }
            
            handler = handlers.get(command)
            if handler:
                result = await handler(args)
            else:
                result = {"success": False, "error": f"Unknown command: {command}"}
            
            result["_id"] = request_id
            print(json.dumps(result), flush=True)
            
        except json.JSONDecodeError as e:
            print(json.dumps({"success": False, "error": f"Invalid JSON: {str(e)}"}), flush=True)
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}), flush=True)

if __name__ == "__main__":
    asyncio.run(main())
