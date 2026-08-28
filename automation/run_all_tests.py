import os
import sys
import argparse
import time

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from automation.config.config import Config
from automation.utils.logger import get_logger
from automation.utils.excel_reporter import ExcelReporter
from automation.utils.html_reporter import HTMLReporter

import automation.tests.test_selenium_website as web_suite
import automation.tests.test_appium_android as android_suite
import automation.tests.test_unit_api as api_suite
import automation.tests.test_validation as val_suite
import automation.tests.test_deployment_status as dep_suite
import automation.tests.test_load_performance as load_suite

logger = get_logger("MasterTestRunner")

def run_all(target_suite="all", output_dir=None):
    out_dir = output_dir or Config.REPORTS_DIR
    os.makedirs(out_dir, exist_ok=True)
    
    logger.info("=" * 70)
    logger.info("COGNITO ENTERPRISE TEST AUTOMATION & CI/CD PIPELINE RUNNER")
    logger.info(f"Target Deployment: {Config.BASE_URL}")
    logger.info(f"Report Output Directory: {out_dir}")
    logger.info("=" * 70)
    
    start_time = time.time()
    all_results = []
    
    suites = {
        "website": ("Selenium — Website Tests (300)", web_suite.run_suite),
        "android": ("Appium — Android Tests (300)", android_suite.run_suite),
        "api": ("Unit Tests — API (300)", api_suite.run_suite),
        "validation": ("Validation Tests (300)", val_suite.run_suite),
        "deployment": ("Deployment Status (300)", dep_suite.run_suite),
        "load": ("Load Testing — Performance (300)", load_suite.run_suite)
    }
    
    if target_suite == "all":
        for key, (name, runner_fn) in suites.items():
            logger.info(f"\n---> Starting Suite: {name}")
            results = runner_fn()
            all_results.extend(results)
    elif target_suite in suites:
        name, runner_fn = suites[target_suite]
        logger.info(f"\n---> Starting Suite: {name}")
        results = runner_fn()
        all_results.extend(results)
    else:
        logger.error(f"Unknown suite specified: {target_suite}")
        return 1

    total_duration = time.time() - start_time
    total_count = len(all_results)
    passed_count = sum(1 for t in all_results if t.get("status") == "PASS")
    failed_count = sum(1 for t in all_results if t.get("status") == "FAIL")
    pass_pct = (passed_count / total_count * 100) if total_count > 0 else 0
    
    logger.info("\n" + "=" * 70)
    logger.info("TEST EXECUTION SUMMARY")
    logger.info(f"Total Tests Executed: {total_count}")
    logger.info(f"Passed: {passed_count}")
    logger.info(f"Failed: {failed_count}")
    logger.info(f"Success Rate: {pass_pct:.2f}%")
    logger.info(f"Execution Duration: {total_duration:.2f}s")
    logger.info("=" * 70)
    
    logger.info("\nGenerating Enterprise Reports...")
    excel_path = ExcelReporter.generate_excel_reports(all_results, out_dir)
    logger.info(f"[SUCCESS] Excel Reports Generated: {excel_path}")
    
    html_path = HTMLReporter.generate_html_report(all_results, out_dir)
    logger.info(f"[SUCCESS] HTML Dashboard Generated: {html_path}")
    
    logger.info("All test artifacts compiled successfully.")
    return 0 if failed_count == 0 else 1

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cognito CI/CD Master Test Runner")
    parser.add_argument("--suite", default="all", choices=["all", "website", "android", "api", "validation", "deployment", "load"], help="Target test suite to run")
    parser.add_argument("--output", default=None, help="Custom output directory for reports")
    args = parser.parse_args()
    
    exit_code = run_all(args.suite, args.output)
    sys.exit(exit_code)
